import { useState, useRef, useEffect } from 'react'
import Editor from '@monaco-editor/react'
import './App.css'

const WS_URL = 'ws://localhost:8080';

function getRoomId() {
  const params = new URLSearchParams(window.location.search);
  return params.get('room') || 'room-' + Math.random().toString(36).substr(2, 9);
}

const LANGUAGES = {
  javascript: {
    name: 'JavaScript',
    defaultCode: `// JavaScript Code
console.log("Hello, World!");

function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

console.log("Fibonacci(10):", fibonacci(10));`
  },
  python: {
    name: 'Python',
    defaultCode: `# Python Code
print("Hello, World!")

def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n - 1) + fibonacci(n - 2)

print("Fibonacci(10):", fibonacci(10))`
  },
  java: {
    name: 'Java',
    defaultCode: `// Java Code
public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
        System.out.println("Fibonacci(10): " + fibonacci(10));
    }
    
    public static int fibonacci(int n) {
        if (n <= 1) return n;
        return fibonacci(n - 1) + fibonacci(n - 2);
    }
}`
  },
  cpp: {
    name: 'C++',
    defaultCode: `// C++ Code
#include <iostream>
using namespace std;

int fibonacci(int n) {
    if (n <= 1) return n;
    return fibonacci(n - 1) + fibonacci(n - 2);
}

int main() {
    cout << "Hello, World!" << endl;
    cout << "Fibonacci(10): " << fibonacci(10) << endl;
    return 0;
}`
  }
}

const generateIframeSrcDoc = (userCode) => {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
</head>
<body>
  <script>
    (function() {
      const originalLog = console.log;
      const originalError = console.error;
      const originalWarn = console.warn;
      
      console.log = function(...args) {
        window.parent.postMessage({
          type: 'console.log',
          data: args.map(arg => {
            try {
              return typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg);
            } catch (e) {
              return String(arg);
            }
          })
        }, '*');
        originalLog.apply(console, args);
      };
      
      console.error = function(...args) {
        window.parent.postMessage({
          type: 'console.error',
          data: args.map(arg => String(arg))
        }, '*');
        originalError.apply(console, args);
      };
      
      console.warn = function(...args) {
        window.parent.postMessage({
          type: 'console.warn',
          data: args.map(arg => String(arg))
        }, '*');
        originalWarn.apply(console, args);
      };
      
      window.onerror = function(message, source, lineno, colno, error) {
        window.parent.postMessage({
          type: 'runtime.error',
          data: [error ? error.toString() : message]
        }, '*');
        return false;
      };
      
      window.addEventListener('unhandledrejection', function(event) {
        window.parent.postMessage({
          type: 'runtime.error',
          data: ['Unhandled Promise Rejection: ' + event.reason]
        }, '*');
      });
    })();
  </script>
  
  <script>
    try {
      ${userCode}
    } catch (error) {
      console.error('Execution Error: ' + error.message);
    }
  </script>
</body>
</html>
  `.trim();
};

function App() {
  const [language, setLanguage] = useState('javascript')
  const [code, setCode] = useState(LANGUAGES.javascript.defaultCode)
  const [output, setOutput] = useState([])
  const [isRunning, setIsRunning] = useState(false)

  const [roomId] = useState(getRoomId())
  const [isConnected, setIsConnected] = useState(false)
  const [connectedUsers, setConnectedUsers] = useState(1)
  const [users, setUsers] = useState([])
  const [currentUserId, setCurrentUserId] = useState(null)

  const wsRef = useRef(null)
  const isRemoteChange = useRef(false)
  const hasPromptedName = useRef(false)
  const iframeRef = useRef(null)
  const editorRef = useRef(null)
  const decorationsRef = useRef({})

  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
  console.log('✅ Connected to collaboration server');
  setIsConnected(true);
  
  let userName = 'User' + Math.floor(Math.random() * 1000);
  
  if (!hasPromptedName.current) {
    hasPromptedName.current = true;
    const input = prompt('Enter your name:');
    if (input) userName = input;
  }
  
  const userColor = '#' + Math.floor(Math.random()*16777215).toString(16);
  
  ws.send(JSON.stringify({
    type: 'join',
    roomId: roomId,
    userName: userName,
    userColor: userColor
  }));
  
  const newUrl = `${window.location.pathname}?room=${roomId}`;
  window.history.replaceState(null, '', newUrl);
};

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);

      switch (message.type) {
        case 'init':
          isRemoteChange.current = true;
          setCode(message.code);
          setCurrentUserId(message.userId);
          setUsers(message.users);
          setConnectedUsers(message.users.length);
          break;

        case 'code-update':
          isRemoteChange.current = true;
          setCode(message.code);
          break;

        case 'user-joined':
          setUsers(message.users);
          setConnectedUsers(message.users.length);
          break;

        case 'user-left':
          setUsers(message.users);
          setConnectedUsers(message.users.length);
          if (editorRef.current && message.userId) {
            const userId = message.userId;
            if (decorationsRef.current[userId]) {
              editorRef.current.deltaDecorations(decorationsRef.current[userId], []);
              delete decorationsRef.current[userId];
            }
          }
          break;

        case 'cursor-update':
          if (editorRef.current && message.userId !== currentUserId) {
            updateRemoteCursor(message.userId, message.cursor);
          }
          break;
      }
    };

    ws.onclose = () => {
      console.log('❌ Disconnected from server');
      setIsConnected(false);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'leave' }));
      }
      ws.close();
    };
  }, [roomId]);

  useEffect(() => {
    const handleMessage = (event) => {
      const { type, data } = event.data;

      if (type === 'console.log') {
        setOutput(prev => [...prev, {
          type: 'log',
          content: data.join(' ')
        }]);
      } else if (type === 'console.error') {
        setOutput(prev => [...prev, {
          type: 'error',
          content: data.join(' ')
        }]);
      } else if (type === 'console.warn') {
        setOutput(prev => [...prev, {
          type: 'warn',
          content: data.join(' ')
        }]);
      } else if (type === 'runtime.error') {
        setOutput(prev => [...prev, {
          type: 'error',
          content: '❌ Runtime Error: ' + data.join(' ')
        }]);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const updateRemoteCursor = (userId, cursor) => {
    if (!editorRef.current || !cursor) return;

    const user = users.find(u => u.id === userId);
    if (!user) return;

    const { lineNumber, column } = cursor;

    const oldDecorations = decorationsRef.current[userId] || [];

    const newDecorations = editorRef.current.deltaDecorations(oldDecorations, [
      {
        range: new window.monaco.Range(lineNumber, column, lineNumber, column + 1),
        options: {
          className: `remote-cursor`,
          beforeContentClassName: `cursor-label`,
          before: {
            content: user.name,
            inlineClassName: `cursor-name`,
            backgroundColor: user.color,
            color: '#ffffff'
          }
        }
      }
    ]);

    decorationsRef.current[userId] = newDecorations;
  };

  const handleEditorChange = (value) => {
    setCode(value)

    if (isRemoteChange.current) {
      isRemoteChange.current = false;
      return;
    }

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'code-change',
        code: value
      }));
    }
  }

  const handleLanguageChange = (e) => {
    const newLanguage = e.target.value
    setLanguage(newLanguage)
    setCode(LANGUAGES[newLanguage].defaultCode)
    setOutput([])
  }

  const runCodeWithPiston = async () => {
    setIsRunning(true);
    setOutput([]);

    const languageMap = {
      python: 'python',
      java: 'java',
      cpp: 'c++'
    };

    const extensionMap = {
      python: 'py',
      java: 'java',
      cpp: 'cpp'
    };

    try {
      setOutput([{ type: 'log', content: '⏳ Sending code to execution server...' }]);

      const response = await fetch('https://emkc.org/api/v2/piston/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language: languageMap[language],
          version: '*',
          files: [{
            name: `main.${extensionMap[language]}`,
            content: code
          }]
        })
      });

      const result = await response.json();
      setOutput([]);

      if (result.run.stderr) {
        setOutput([{ type: 'error', content: result.run.stderr }]);
      } else if (result.run.stdout) {
        setOutput([{ type: 'log', content: result.run.stdout }]);
      } else {
        setOutput([{ type: 'log', content: '✓ Code executed successfully' }]);
      }
    } catch (error) {
      setOutput([{ type: 'error', content: '❌ Execution failed: ' + error.message }]);
    } finally {
      setIsRunning(false);
    }
  };

  const runCode = () => {
    if (language !== 'javascript') {
      runCodeWithPiston();
      return;
    }

    setIsRunning(true)
    setOutput([])

    const iframeSrcDoc = generateIframeSrcDoc(code);

    if (iframeRef.current) {
      iframeRef.current.srcdoc = iframeSrcDoc;
    }

    setTimeout(() => setIsRunning(false), 100);
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-main">
          <div>
            <h1>Collaborative Code Editor</h1>
            <p>Real-time collaboration with WebSockets</p>
          </div>
          <div className="connection-status">
            <div className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}>
              <span className="status-dot"></span>
              {isConnected ? 'Connected' : 'Disconnected'}
            </div>
            <div className="room-info">
              <span className="room-label">Room:</span>
              <code className="room-id">{roomId}</code>
              <button
                className="copy-btn"
                onClick={() => {
                  navigator.clipboard.writeText(window.location.href);
                  alert('Room URL copied! Share it with others to collaborate.');
                }}
              >
                📋 Copy Link
              </button>
            </div>
            <div className="user-count">
              👥 {connectedUsers} user{connectedUsers !== 1 ? 's' : ''}
            </div>
            <button
              className="theme-toggle"
              onClick={() => {
                const root = document.documentElement;
                const current = root.getAttribute('data-theme');
                root.setAttribute('data-theme', current === 'light' ? 'dark' : 'light');
              }}
            >
              <span className="theme-icon sun">☀️</span>
              <span className="theme-icon moon">🌙</span>
            </button>
          </div>
        </div>
      </header>

      <div className="container">
        <div className="editor-section">
          <div className="editor-header">
            <h2>Editor</h2>
            <div className="controls">
              <select
                value={language}
                onChange={handleLanguageChange}
                className="language-selector"
              >
                {Object.entries(LANGUAGES).map(([key, lang]) => (
                  <option key={key} value={key}>
                    {lang.name}
                  </option>
                ))}
              </select>

              <button
                onClick={runCode}
                disabled={isRunning}
                className="run-button"
                title={language === 'javascript' ? 'Run JavaScript in browser' : 'Run ' + LANGUAGES[language].name + ' on remote server'}
              >
                {isRunning ? '⏳ Running...' : '▶ Run Code'}
              </button>
            </div>
          </div>

          <Editor
            height="500px"
            language={language}
            value={code}
            onChange={handleEditorChange}
            theme="vs-dark"
            onMount={(editor) => {
              editorRef.current = editor;

              editor.onDidChangeCursorPosition((e) => {
                if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                  wsRef.current.send(JSON.stringify({
                    type: 'cursor-move',
                    cursor: {
                      lineNumber: e.position.lineNumber,
                      column: e.position.column
                    }
                  }));
                }
              });
            }}
            options={{
              fontSize: 14,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              automaticLayout: true,
            }}
          />
        </div>

        <div className="sidebar">
          <div className="state-section">
            <h2>Active Users</h2>
            <div className="user-list">
              {users.map(user => (
                <div
                  key={user.id}
                  className={`user-item ${user.id === currentUserId ? 'current-user' : ''}`}
                >
                  <div
                    className="user-avatar"
                    style={{ backgroundColor: user.color }}
                  >
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="user-name">
                    {user.name} {user.id === currentUserId && '(You)'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="state-section">
            <h2>Editor State</h2>
            <div className="state-display">
              <p><strong>Language:</strong> {LANGUAGES[language].name}</p>
              <p><strong>Characters:</strong> {code.length}</p>
              <p><strong>Lines:</strong> {code.split('\n').length}</p>
              <p><strong>Executable:</strong> ✅ Yes</p>
              <p><strong>Execution:</strong> {language === 'javascript' ? 'Browser (sandboxed)' : 'Remote server (Piston API)'}</p>
            </div>
          </div>

          <div className="output-section">
            <h2>Console Output</h2>
            {output.length > 0 ? (
              <div className="console-output">
                {output.map((item, index) => (
                  <div
                    key={index}
                    className={`log-line ${item.type === 'error' ? 'log-error' : item.type === 'warn' ? 'log-warn' : ''}`}
                  >
                    <span className="log-arrow">{'>'}</span>
                    <span className="log-content">{item.content}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-output">
                {language === 'javascript'
                  ? '💡 Click "Run Code" to execute JavaScript in browser'
                  : `💡 Click "Run Code" to execute ${LANGUAGES[language].name} on remote server`
                }
              </div>
            )}
          </div>
        </div>
      </div>

      <iframe
        ref={iframeRef}
        sandbox="allow-scripts"
        style={{ display: 'none' }}
        title="code-executor"
      />
    </div>
  )
}

export default App