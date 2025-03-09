import express from 'express';
import { exec } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from "openai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3001;

// Increase the request size limit - MUST come BEFORE other middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve static files from the React app
app.use(express.static(path.join(__dirname, 'dist')));

// Initialize OpenAI client with API key from environment variable
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// API endpoint to get LaTeX source
app.get('/api/latex', (req, res) => {
  const arxivId = req.query.arxivId;
  
  if (!arxivId) {
    return res.status(400).send('ArXiv ID is required');
  }
  
  // Execute the arxiv-to-prompt command
  exec(`arxiv-to-prompt ${arxivId}`, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error: ${error.message}`);
      return res.status(500).send(`Error fetching LaTeX source: ${error.message}`);
    }
    
    if (stderr) {
      console.error(`stderr: ${stderr}`);
    }
    
    res.send(stdout);
  });
});

// API endpoint for chat completions
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, stream = false } = req.body;
    
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required' });
    }
    
    // Convert messages to the format OpenAI expects
    const formattedMessages = messages.map(msg => ({
      role: msg.sender === 'user' ? 'user' : 'assistant',
      content: msg.text
    }));
    
    // Add system message at the beginning
    formattedMessages.unshift({
      role: "system",
      content: "You are a helpful AI assistant that helps users understand academic papers. The user will provide the LaTeX source of a paper before their first question. When this happens, use the paper content to provide accurate and relevant answers. Format your responses using Markdown for better readability. Use headings, lists, code blocks, and other formatting as appropriate. For mathematical expressions, use LaTeX notation: inline math with single dollar signs ($...$) and block math with double dollar signs ($$...$$). Do not use other formatting such as brackets. Avoid using new commands that are defined in the paper. For example, if $\newcommand{\train}{\mathcal{D}}$, use $\mathcal{D}$ instead of $\train$."
    });

    // If streaming is requested
    if (stream) {
      // Set appropriate headers for SSE
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      // Send initial message with ID
      const messageId = Date.now() + 1; // Ensure unique ID
      res.write(`data: ${JSON.stringify({ id: messageId, sender: 'assistant', text: '', isComplete: false })}\n\n`);
      
      try {
        // Create streaming request to OpenAI
        const stream = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: formattedMessages,
          temperature: 0.7,
          stream: true,
        });
        
        let accumulatedText = '';
        
        // Process each chunk as it arrives
        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content || '';
          accumulatedText += content;
          
          // Send the chunk to the client
          if (content) {
            res.write(`data: ${JSON.stringify({ id: messageId, sender: 'assistant', text: content, isComplete: false, isChunk: true })}\n\n`);
            // Flush the response to ensure chunks are sent immediately
            if (res.flush) res.flush();
          }
        }
        
        // Send final complete message
        res.write(`data: ${JSON.stringify({ id: messageId, sender: 'assistant', text: accumulatedText, isComplete: true })}\n\n`);
        return res.end();
      } catch (streamError) {
        console.error('Error in streaming response:', streamError);
        res.write(`data: ${JSON.stringify({ error: 'Failed to get streaming response from AI', isComplete: true })}\n\n`);
        return res.end();
      }
    } else {
      // Non-streaming response (original behavior)
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: formattedMessages,
        temperature: 0.7,
      });
      
      const reply = response.choices[0].message.content;
      
      res.json({
        id: Date.now(),
        text: reply,
        sender: 'assistant',
      });
    }
  } catch (error) {
    console.error('Error calling OpenAI:', error);
    res.status(500).json({ error: 'Failed to get response from AI' });
  }
});

// All other GET requests not handled before will return the React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Only one app.listen call is needed
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
}); 