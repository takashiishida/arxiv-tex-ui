import { useState, useEffect, useRef } from 'react'
import './PaperViewer.css'
import Prism from 'prismjs'
import 'prismjs/components/prism-latex'
import 'prismjs/themes/prism-tomorrow.css'

function PaperViewer({ pdfUrl, setLatexSource, setIsLatexLoading, latexSource, isLatexLoading }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('pdf')
  const [arxivId, setArxivId] = useState('')
  const [latexError, setLatexError] = useState(null)
  const codeRef = useRef(null)
  const [fullscreen, setFullscreen] = useState(false)
  const viewerRef = useRef(null)

  useEffect(() => {
    if (pdfUrl) {
      setLoading(true)
      setError(null)
      
      // Extract arxivId from pdfUrl
      const match = pdfUrl.match(/arxiv\.org\/pdf\/([^/]+)\.pdf/)
      if (match && match[1]) {
        setArxivId(match[1])
      }
    }
  }, [pdfUrl])

  // Apply syntax highlighting when latexSource changes
  useEffect(() => {
    if (codeRef.current && latexSource) {
      Prism.highlightElement(codeRef.current)
    }
  }, [latexSource, activeTab])

  // Handle fullscreen mode
  useEffect(() => {
    const handleEsc = (event) => {
      if (event.key === 'Escape') {
        setFullscreen(false)
      }
    }
    
    if (fullscreen) {
      document.addEventListener('keydown', handleEsc)
    }
    
    return () => {
      document.removeEventListener('keydown', handleEsc)
    }
  }, [fullscreen])

  const handleIframeLoad = () => {
    setLoading(false)
  }

  const handleIframeError = () => {
    setLoading(false)
    setError('Failed to load PDF. Please check the arXiv ID.')
  }

  const toggleFullscreen = () => {
    setFullscreen(!fullscreen)
  }

  return (
    <div 
      className={`paper-viewer ${fullscreen ? 'fullscreen' : ''}`} 
      ref={viewerRef}
    >
      {!pdfUrl ? (
        <div className="placeholder">
          <p>No paper loaded</p>
        </div>
      ) : (
        <>
          <div className="viewer-header">
            <div className="tabs">
              <button 
                className={`tab-button ${activeTab === 'pdf' ? 'active' : ''}`}
                onClick={() => setActiveTab('pdf')}
              >
                PDF View
              </button>
              <button 
                className={`tab-button ${activeTab === 'latex' ? 'active' : ''}`}
                onClick={() => setActiveTab('latex')}
              >
                LaTeX Source
              </button>
            </div>
            <div className="viewer-controls">
              <button 
                className="control-button"
                onClick={toggleFullscreen}
                aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                title={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              >
                {fullscreen ? "Exit Fullscreen" : "Fullscreen"}
              </button>
            </div>
          </div>
          
          {activeTab === 'pdf' && (
            <div className="pdf-container">
              {loading && (
                <div className="loading">Loading PDF...</div>
              )}
              {error && <div className="error">{error}</div>}
              <iframe 
                src={pdfUrl}
                className="pdf-iframe" 
                onLoad={handleIframeLoad}
                onError={handleIframeError}
                title="PDF Viewer"
                frameBorder="0"
              />
            </div>
          )}
          
          {activeTab === 'latex' && (
            <div className="latex-container">
              {isLatexLoading && <div className="loading">Loading LaTeX source...</div>}
              {latexError && <div className="error">{latexError}</div>}
              {!isLatexLoading && !latexError && latexSource && (
                <pre className="latex-code">
                  <code ref={codeRef} className="language-latex">{latexSource}</code>
                </pre>
              )}
              {!isLatexLoading && !latexError && !latexSource && (
                <div className="loading">No LaTeX source available yet. Click to load.</div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default PaperViewer 