import { useState, useEffect, useRef, useCallback } from 'react'
import { pdfjs } from 'react-pdf'
import './App.css'
import PaperViewer from './components/PaperViewer'
import ChatInterface from './components/ChatInterface'

// Initialize PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`

function App() {
  const [arxivId, setArxivId] = useState('')
  const [previousArxivId, setPreviousArxivId] = useState('') // Track previous arXiv ID
  const [pdfUrl, setPdfUrl] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [latexSource, setLatexSource] = useState('')
  const [isLatexLoading, setIsLatexLoading] = useState(false)
  const [leftPanelWidth, setLeftPanelWidth] = useState(50) // Default 50%
  const [isDragging, setIsDragging] = useState(false)
  const dividerRef = useRef(null)
  const containerRef = useRef(null)
  const isDraggingRef = useRef(false)
  const chatInterfaceRef = useRef(null) // Reference to the ChatInterface component

  // Create refs for the event handlers to avoid circular dependencies
  const handleMouseMoveRef = useRef(null);
  const handleMouseUpRef = useRef(null);

  // Define the event handlers
  handleMouseMoveRef.current = (e) => {
    if (containerRef.current && isDraggingRef.current) {
      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100;
      // Limit the width between 20% and 80%
      const limitedWidth = Math.min(Math.max(newWidth, 20), 80);
      setLeftPanelWidth(limitedWidth);
    }
  };

  handleMouseUpRef.current = () => {
    isDraggingRef.current = false;
    setIsDragging(false);
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.removeEventListener('mouseleave', handleMouseUp);
  };

  // Create stable callback functions that reference the current handlers
  const handleMouseMove = useCallback((e) => {
    handleMouseMoveRef.current(e);
  }, []);

  const handleMouseUp = useCallback(() => {
    handleMouseUpRef.current();
  }, []);

  // Handle divider drag
  const handleDividerMouseDown = (e) => {
    e.preventDefault();
    isDraggingRef.current = true;
    setIsDragging(true);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    // Add a safety cleanup in case mouseup happens outside the window
    document.addEventListener('mouseleave', handleMouseUp);
  };

  useEffect(() => {
    // Simulate initial loading
    const timer = setTimeout(() => {
      setIsLoading(false)
    }, 1000)
    
    return () => clearTimeout(timer)
  }, [])

  // Cleanup event listeners when component unmounts
  useEffect(() => {
    return () => {
      isDraggingRef.current = false;
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mouseleave', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  const handleArxivSubmit = (e) => {
    e.preventDefault()
    const trimmedArxivId = arxivId.trim()
    if (trimmedArxivId) {
      // Check if this is a different arXiv ID than before
      const isNewPaper = trimmedArxivId !== previousArxivId
      
      // Direct link to arXiv PDF - will be handled by iframe which doesn't have CORS issues
      setPdfUrl(`https://arxiv.org/pdf/${trimmedArxivId}.pdf`)
      // Reset LaTeX source when loading a new paper
      setLatexSource('')
      // Start loading LaTeX source immediately
      setIsLatexLoading(true)
      
      // If this is a new paper, clear the chat
      if (isNewPaper && chatInterfaceRef.current) {
        chatInterfaceRef.current.clearChat()
        // Update the previous arXiv ID
        setPreviousArxivId(trimmedArxivId)
      }
      
      // Fetch LaTeX source immediately
      fetch(`/api/latex?arxivId=${trimmedArxivId}`)
        .then(response => {
          if (!response.ok) {
            throw new Error('Failed to fetch LaTeX source')
          }
          return response.text()
        })
        .then(data => {
          setLatexSource(data)
          setIsLatexLoading(false)
        })
        .catch(error => {
          console.error('Error fetching LaTeX source:', error)
          setIsLatexLoading(false)
        })
    }
  }

  // Determine if a paper is loaded
  const isPaperLoaded = Boolean(pdfUrl)

  return (
    <div className="app-container">
      {isLoading ? (
        <div className="loading-screen">
          <div className="loading-spinner"></div>
          <p>Loading Paper Reader...</p>
        </div>
      ) : (
        <>
          <div className="header">
            <form onSubmit={handleArxivSubmit} className="arxiv-form">
              <input
                type="text"
                value={arxivId}
                onChange={(e) => setArxivId(e.target.value)}
                placeholder="Enter arXiv ID (e.g., 2202.00395)"
                className="arxiv-input"
              />
              <button type="submit" className="arxiv-button">Load Paper</button>
            </form>
          </div>
          
          <div className={`main-content ${isDragging ? 'dragging' : ''}`} ref={containerRef}>
            <div 
              className="panel-left" 
              style={{ width: `${leftPanelWidth}%` }}
            >
              <PaperViewer 
                pdfUrl={pdfUrl} 
                setLatexSource={setLatexSource} 
                setIsLatexLoading={setIsLatexLoading}
                latexSource={latexSource}
                isLatexLoading={isLatexLoading}
              />
            </div>
            
            <div 
              className={`divider ${isDragging ? 'active' : ''}`}
              ref={dividerRef}
              onMouseDown={handleDividerMouseDown}
            ></div>
            
            <div 
              className="panel-right" 
              style={{ width: `${100 - leftPanelWidth}%` }}
            >
              <ChatInterface 
                ref={chatInterfaceRef}
                latexSource={latexSource}
                isLatexLoading={isLatexLoading}
                isPaperLoaded={isPaperLoaded}
              />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default App
