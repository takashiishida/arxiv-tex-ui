import { useState, useRef, useEffect, forwardRef, useImperativeHandle, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import './ChatInterface.css'

const ChatInterface = forwardRef(({ latexSource, isLatexLoading, isPaperLoaded }, ref) => {
  const [messages, setMessages] = useState([])
  const [apiMessages, setApiMessages] = useState([])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [streamingMessageId, setStreamingMessageId] = useState(null)
  const messagesEndRef = useRef(null)
  const messagesContainerRef = useRef(null)
  const streamingMessageRef = useRef(null) // Reference to the streaming message element
  const inputRef = useRef(null)
  const eventSourceRef = useRef(null)

  // Expose the clearChat method to parent components
  useImperativeHandle(ref, () => ({
    clearChat: () => {
      setMessages([])
      setApiMessages([])
      // Close any active SSE connection
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
    }
  }))

  // Function to scroll to bottom - use direct DOM manipulation for more reliable scrolling
  const scrollToBottom = useCallback(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, []);

  // Always force scroll to bottom during streaming
  useEffect(() => {
    if (streamingMessageId) {
      // Immediately scroll to bottom
      scrollToBottom();
      
      // Set up an interval to keep scrolling during streaming
      const scrollInterval = setInterval(() => {
        scrollToBottom();
      }, 10); // Very frequent scrolling (every 10ms)
      
      return () => clearInterval(scrollInterval);
    }
  }, [streamingMessageId, scrollToBottom]);

  // Regular scroll for non-streaming updates
  useEffect(() => {
    if (!streamingMessageId) {
      scrollToBottom();
    }
  }, [messages, isLoading, streamingMessageId, scrollToBottom]);

  // Focus input when loading completes
  useEffect(() => {
    if (!isLoading && !isLatexLoading && isPaperLoaded) {
      inputRef.current?.focus()
    }
  }, [isLoading, isLatexLoading, isPaperLoaded])

  // Cleanup event source on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }
    }
  }, [])

  const handleSubmit = (e) => {
    e.preventDefault();
    if (inputValue.trim() === '' || isLoading || isLatexLoading) return;
    
    const newMessage = {
      id: Date.now(),
      text: inputValue,
      sender: 'user',
    };
    
    // Add the user message to the chat (this is what's displayed in the UI)
    setMessages(prevMessages => [...prevMessages, newMessage]);
    setInputValue('');
    setIsLoading(true);
    
    // Create a copy of the new message for the API
    let apiNewMessage = { ...newMessage };
    
    // If this is the first message and we have LaTeX, include it in the API message
    if (apiMessages.length === 0 && latexSource) {
      apiNewMessage.text = `### PAPER CONTENT (LATEX SOURCE):\n\n${latexSource}\n\n### END OF PAPER CONTENT ###\n\nPlease use the above paper content to answer the following question:\n\n${newMessage.text}`;
    }
    
    // Update the API messages state
    setApiMessages(prevApiMessages => [...prevApiMessages, apiNewMessage]);
    
    // Close any existing SSE connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }

    // Generate a unique message ID for the response
    const responseId = Date.now() + 1; // Ensure it's different from the user message ID
    setStreamingMessageId(responseId);
    
    // Add an empty assistant message that will be filled with streaming content
    setMessages(prevMessages => [
      ...prevMessages,
      {
        id: responseId,
        text: '',
        sender: 'assistant',
        isStreaming: true
      }
    ]);

    // Create a copy of the current API messages to send to the server
    const currentApiMessages = [...apiMessages, apiNewMessage];
    
    // Use fetch with streaming instead of EventSource
    fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: currentApiMessages,
        stream: true
      })
    })
    .then(response => {
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedText = '';
      
      // Function to process the stream
      function processStream() {
        return reader.read().then(({ done, value }) => {
          if (done) {
            setIsLoading(false);
            setStreamingMessageId(null);
            return;
          }
          
          // Decode the chunk and split by lines
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n\n');
          
          // Process each line (each SSE message)
          lines.forEach(line => {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.substring(6));
                
                if (data.isChunk) {
                  accumulatedText += data.text;
                  
                  // Update the streaming message with new content
                  setMessages(prevMessages => {
                    const streamingMsgIndex = prevMessages.findIndex(msg => msg.id === responseId);
                    
                    if (streamingMsgIndex >= 0) {
                      const updatedMessages = [...prevMessages];
                      updatedMessages[streamingMsgIndex] = {
                        ...updatedMessages[streamingMsgIndex],
                        text: accumulatedText
                      };
                      return updatedMessages;
                    }
                    return prevMessages;
                  });
                  
                  // Use requestAnimationFrame to ensure the DOM has updated before scrolling
                  requestAnimationFrame(() => {
                    // Add a small delay to allow the container to expand
                    setTimeout(() => {
                      // Force immediate scroll after each chunk
                      scrollToBottom();
                      
                      // If we have a reference to the streaming message, ensure it's visible
                      if (streamingMessageRef.current) {
                        // Force the streaming message to update its layout
                        streamingMessageRef.current.style.height = 'auto';
                        
                        // Ensure the streaming message is fully visible
                        const containerHeight = messagesContainerRef.current?.clientHeight || 0;
                        const messageHeight = streamingMessageRef.current.scrollHeight;
                        const messageTop = streamingMessageRef.current.offsetTop;
                        const scrollTop = messagesContainerRef.current?.scrollTop || 0;
                        
                        // If the message is taller than the container or extends beyond the visible area
                        if (messageHeight > containerHeight || messageTop + messageHeight > scrollTop + containerHeight) {
                          // Scroll to show as much of the message as possible
                          messagesContainerRef.current.scrollTop = messageTop + messageHeight - containerHeight + 50; // Add padding
                        }
                      }
                    }, 10); // Small delay to allow DOM to update
                  });
                } else if (data.isComplete) {
                  // Final message received
                  setMessages(prevMessages => {
                    const streamingMsgIndex = prevMessages.findIndex(msg => msg.id === responseId);
                    
                    if (streamingMsgIndex >= 0) {
                      const updatedMessages = [...prevMessages];
                      updatedMessages[streamingMsgIndex] = {
                        ...updatedMessages[streamingMsgIndex],
                        text: data.text,
                        isStreaming: false
                      };
                      return updatedMessages;
                    }
                    return prevMessages;
                  });
                  
                  // Also add the assistant's response to the API messages
                  setApiMessages(prevApiMessages => [
                    ...prevApiMessages,
                    {
                      id: responseId,
                      text: data.text,
                      sender: 'assistant'
                    }
                  ]);
                  
                  // Final scroll to bottom when streaming completes
                  setTimeout(() => {
                    scrollToBottom();
                    // Double-check scroll position after a short delay
                    setTimeout(scrollToBottom, 100);
                  }, 50);
                }
              } catch (e) {
                console.error('Error parsing SSE data:', e);
              }
            }
          });
          
          // Continue reading the stream
          return processStream();
        });
      }
      
      // Start processing the stream
      return processStream();
    })
    .catch(error => {
      console.error('Error:', error);
      setIsLoading(false);
      setStreamingMessageId(null);
      
      // Remove the streaming message and add an error message
      setMessages(prevMessages => [
        ...prevMessages.filter(msg => msg.id !== responseId),
        {
          id: Date.now() + 2, // Ensure unique ID
          text: "Sorry, there was an error processing your request. Please try again.",
          sender: 'assistant',
          isError: true
        }
      ]);
      
      // Also update the API messages to include the error
      setApiMessages(prevApiMessages => [
        ...prevApiMessages,
        {
          id: Date.now() + 2, // Ensure unique ID
          text: "Sorry, there was an error processing your request. Please try again.",
          sender: 'assistant',
          isError: true
        }
      ]);
    });
  };

  // Function to clear chat messages
  const clearChat = () => {
    setMessages([]);
    setApiMessages([]);
    // Close any active SSE connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
  };

  return (
    <div className="chat-interface">
      <div className="messages-container" ref={messagesContainerRef}>
        {messages.length === 0 ? (
          <div className={`empty-chat ${!isPaperLoaded ? 'no-paper' : ''}`}>
            <h2>Chat with the Paper</h2>
            {isPaperLoaded ? (
              <>
                <p>Ask a question about the paper</p>
                <div className="suggestion-chips">
                  <button 
                    className="suggestion-chip"
                    onClick={() => setInputValue("Summarize the main findings of this paper")}
                    disabled={isLoading || isLatexLoading}
                  >
                    Summarize main findings
                  </button>
                  <button 
                    className="suggestion-chip"
                    onClick={() => setInputValue("Explain the methodology used in this paper")}
                    disabled={isLoading || isLatexLoading}
                  >
                    Explain methodology
                  </button>
                  <button 
                    className="suggestion-chip"
                    onClick={() => setInputValue("What are the limitations of this research?")}
                    disabled={isLoading || isLatexLoading}
                  >
                    Research limitations
                  </button>
                </div>
              </>
            ) : (
              <div className="no-paper-message">
                <p>Please load a paper first by entering an arXiv ID above</p>
                <p className="example-text">Example: 2202.00395</p>
              </div>
            )}
          </div>
        ) : (
          messages.map((message) => (
            <div 
              key={message.id} 
              className={`message ${message.sender} ${message.isError ? 'error-message' : ''} ${message.isStreaming ? 'streaming' : ''}`}
              ref={message.isStreaming ? streamingMessageRef : null}
            >
              <div className="message-content">
                {message.sender === 'assistant' ? (
                  <ReactMarkdown
                    remarkPlugins={[remarkMath]}
                    rehypePlugins={[rehypeKatex]}
                  >
                    {message.text}
                  </ReactMarkdown>
                ) : (
                  <p>{message.text}</p>
                )}
              </div>
            </div>
          ))
        )}
        
        {isLoading && !streamingMessageId && (
          <div className="message assistant loading-message">
            <div className="message-content">
              <p>Thinking...</p>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>
      
      <form onSubmit={handleSubmit} className="input-area">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder={!isPaperLoaded ? "Load a paper first..." : isLatexLoading ? "Waiting for paper content..." : "Type your message here..."}
          className="message-input"
          disabled={isLoading || isLatexLoading || !isPaperLoaded}
          ref={inputRef}
        />
        <div className="button-group">
          <button 
            type="submit" 
            className={`send-button ${isLatexLoading ? 'waiting' : ''} ${!isPaperLoaded ? 'disabled' : ''}`} 
            disabled={isLoading || isLatexLoading || inputValue.trim() === '' || !isPaperLoaded}
            aria-label="Send message"
          >
            {isLatexLoading ? "Waiting..." : "Send"}
          </button>
          
          <button 
            type="button"
            className="clear-chat-button"
            onClick={clearChat}
            aria-label="Clear chat"
            disabled={isLoading || isLatexLoading || messages.length === 0 || !isPaperLoaded}
          >
            Clear Chat
          </button>
        </div>
      </form>
    </div>
  )
})

export default ChatInterface 