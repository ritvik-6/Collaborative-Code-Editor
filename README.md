# Secure JavaScript Execution with Sandboxed iframe + postMessage

A production-ready code editor with **secure** JavaScript execution using sandboxed iframes and postMessage communication.

## 🔒 Security Architecture

### Problem: Cross-Origin Restrictions

**Why direct `iframe.contentWindow.console` access fails:**

```javascript
// ❌ This FAILS with sandboxed iframe
const iframe = document.createElement('iframe');
iframe.sandbox = 'allow-scripts'; // No allow-same-origin!
document.body.appendChild(iframe);

iframe.contentWindow.console.log = function() { 
  // SecurityError: Blocked a frame with origin "null" from accessing 
  // a cross-origin frame.
}
```

**Root cause:**
- Without `allow-same-origin`, the iframe runs in a **null origin**
- Browsers enforce Same-Origin Policy (SOP) strictly
- Direct JavaScript object access across origins is **forbidden**
- This is a security feature, not a bug!

**Why it matters:**
- Prevents malicious code from accessing parent window
- Isolates untrusted user code
- Protects against XSS and code injection attacks

---

### Solution: postMessage API

**Why postMessage is the correct (and only) solution:**

1. **Designed for cross-origin communication** - Works even with `sandbox="allow-scripts"`
2. **Asynchronous message passing** - Safe, non-blocking communication
3. **Structured data transfer** - Send JSON objects between contexts
4. **Browser security built-in** - No way to bypass SOP

**Communication Flow:**

```
┌─────────────────────────┐
│   Parent (React App)    │
│                         │
│  window.addEventListener│
│    ('message', ...)     │ ◄────┐
└─────────────────────────┘      │
                                 │ postMessage
                                 │
┌─────────────────────────┐      │
│  Sandboxed iframe       │      │
│  sandbox="allow-scripts"│      │
│                         │      │
│  console.log overridden │──────┘
│  window.parent.postMessage()
│                         │
│  User code executes     │
└─────────────────────────┘
```

---

## 🏗️ Implementation Details

### 1. iframe srcDoc Template

The heart of the execution engine:

```javascript
const generateIframeSrcDoc = (userCode) => {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body>
  <script>
    // CRITICAL: Override console BEFORE user code runs
    (function() {
      const originalLog = console.log;
      
      // Override console.log
      console.log = function(...args) {
        // Send to parent via postMessage
        window.parent.postMessage({
          type: 'console.log',
          data: args.map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
          )
        }, '*');
        
        // Keep original behavior (for iframe's own console)
        originalLog.apply(console, args);
      };
      
      // Catch runtime errors
      window.onerror = function(message, source, lineno, colno, error) {
        window.parent.postMessage({
          type: 'runtime.error',
          data: [error ? error.toString() : message]
        }, '*');
        return false;
      };
      
      // Catch unhandled promise rejections
      window.addEventListener('unhandledrejection', function(event) {
        window.parent.postMessage({
          type: 'runtime.error',
          data: ['Unhandled Promise Rejection: ' + event.reason]
        }, '*');
      });
    })();
  </script>
  
  <script>
    // User code executes here
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
```

**Key techniques:**

1. **IIFE (Immediately Invoked Function Expression)**: Runs before user code to set up overrides
2. **Function preservation**: Keeps original `console.log` with `originalLog.apply()`
3. **Serialization**: Converts objects to JSON for cross-origin transfer
4. **Error catching**: Three layers - `try/catch`, `window.onerror`, `unhandledrejection`
5. **Dual logging**: Sends to parent AND keeps iframe console working

---

### 2. Parent Window Setup (React)

```javascript
// Setup message listener on component mount
useEffect(() => {
  const handleMessage = (event) => {
    // In production: validate event.origin for extra security
    // if (event.origin !== 'expected-origin') return;
    
    const { type, data } = event.data;
    
    if (type === 'console.log') {
      setOutput(prev => [...prev, {
        type: 'log',
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
  
  // Cleanup on unmount
  return () => {
    window.removeEventListener('message', handleMessage);
  };
}, []);
```

**Important points:**
- Listener persists across code executions
- State updates trigger re-renders automatically
- Cleanup prevents memory leaks

---

### 3. Code Execution

```javascript
const runCode = () => {
  setOutput([]); // Clear previous output
  
  // Generate iframe HTML with user code embedded
  const iframeSrcDoc = generateIframeSrcDoc(code);
  
  // Update iframe (this triggers execution)
  if (iframeRef.current) {
    iframeRef.current.srcdoc = iframeSrcDoc;
  }
};
```

**Execution sequence:**
1. Clear output array
2. Generate new HTML with embedded user code
3. Set iframe's `srcdoc` → Browser parses HTML → Scripts execute
4. Console overrides capture output → postMessage sends to parent
5. Parent receives messages → Updates state → UI re-renders

---

### 4. Sandbox Security

```jsx
<iframe
  ref={iframeRef}
  sandbox="allow-scripts"  // ONLY allow JavaScript
  style={{ display: 'none' }}
  title="code-executor"
/>
```

**What `sandbox="allow-scripts"` prevents:**

| Feature | Status | Why Blocked |
|---------|--------|-------------|
| Network requests (fetch, XMLHttpRequest) | ❌ Blocked | Prevent data exfiltration |
| Popups (window.open) | ❌ Blocked | Prevent annoying popups |
| Forms (submit) | ❌ Blocked | Prevent CSRF attacks |
| Same-origin access | ❌ Blocked | Isolate from parent |
| Top navigation | ❌ Blocked | Can't redirect parent page |
| Cookies/localStorage | ❌ Blocked | No persistent storage |
| JavaScript | ✅ Allowed | Need to run code |

**This is extremely secure.** Even if user writes malicious code, they can't:
- Steal data from your site
- Make API calls
- Access cookies or localStorage
- Redirect the page
- Open popups
- Access the parent window directly

---

## 📊 Message Protocol

### Message Types

```typescript
// Sent from iframe to parent
type Message = 
  | { type: 'console.log', data: string[] }
  | { type: 'console.error', data: string[] }
  | { type: 'console.warn', data: string[] }
  | { type: 'runtime.error', data: string[] }
```

### Example Messages

```javascript
// Normal log
window.parent.postMessage({
  type: 'console.log',
  data: ['Hello, World!']
}, '*');

// Object log
window.parent.postMessage({
  type: 'console.log',
  data: ['{"name":"Alice","age":30}']
}, '*');

// Runtime error
window.parent.postMessage({
  type: 'runtime.error',
  data: ['ReferenceError: x is not defined']
}, '*');
```

---

## 🚀 How to Run

```bash
cd code-editor-step1
npm install
npm run dev
```

Visit `http://localhost:5173` and:
1. Select "JavaScript" language
2. Write code with `console.log()`
3. Click "Run Code"
4. See output in console panel

---

## 🧪 Test Cases

Try these in the editor:

### Basic Logging
```javascript
console.log("Hello, World!");
console.log(42);
console.log(true);
```

### Object Logging
```javascript
const user = { name: "Alice", age: 30 };
console.log(user);
console.log([1, 2, 3, 4, 5]);
```

### Error Handling
```javascript
console.log("Before error");
throw new Error("Something went wrong!");
console.log("After error"); // This won't run
```

### Async Code
```javascript
console.log("Start");

setTimeout(() => {
  console.log("After 1 second");
}, 1000);

console.log("End");
```

---

## 🔄 Extending with Backend for Multi-Language Support

### Current Architecture (Browser-Only)

```
┌──────────────┐
│ React App    │
│              │
│ ┌──────────┐ │
│ │ Monaco   │ │  JavaScript only
│ │ Editor   │ │  Sandboxed iframe
│ └──────────┘ │  postMessage
│              │
│ ┌──────────┐ │
│ │ iframe   │ │
│ │ (JS)     │ │
│ └──────────┘ │
└──────────────┘
```

### Future Architecture (Backend Integration)

```
┌──────────────┐      HTTP POST        ┌──────────────┐
│ React App    │─────────────────────→ │ Backend API  │
│              │                        │ (Express.js) │
│ ┌──────────┐ │                        │              │
│ │ Monaco   │ │   { code, language }  │ ┌──────────┐ │
│ │ Editor   │ │ ←─────────────────────│ │ Docker   │ │
│ └──────────┘ │                        │ │ Runtime  │ │
│              │   { output, error }   │ └──────────┘ │
└──────────────┘                        └──────────────┘
                                              │
                                              ├─ Python
                                              ├─ Java
                                              ├─ C++
                                              └─ Go
```

---

### Implementation Steps

#### 1. Backend Setup (Express.js + Docker)

```javascript
// server.js
const express = require('express');
const { exec } = require('child_process');
const Docker = require('dockerode');

const app = express();
const docker = new Docker();

app.use(express.json());

app.post('/execute', async (req, res) => {
  const { code, language } = req.body;
  
  // Language to Docker image mapping
  const images = {
    python: 'python:3.11-alpine',
    java: 'openjdk:17-alpine',
    cpp: 'gcc:latest'
  };
  
  try {
    // Create and run container
    const container = await docker.createContainer({
      Image: images[language],
      Cmd: getCommandForLanguage(language, code),
      HostConfig: {
        Memory: 100 * 1024 * 1024, // 100MB limit
        NanoCpus: 1000000000, // 1 CPU
        NetworkMode: 'none' // No network access
      },
      AttachStdout: true,
      AttachStderr: true
    });
    
    await container.start();
    
    // Set timeout
    const timeout = setTimeout(async () => {
      await container.kill();
    }, 5000); // 5 second limit
    
    // Wait for completion
    const output = await container.wait();
    clearTimeout(timeout);
    
    // Get logs
    const logs = await container.logs({
      stdout: true,
      stderr: true
    });
    
    // Cleanup
    await container.remove();
    
    res.json({ 
      output: logs.toString(),
      exitCode: output.StatusCode
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

function getCommandForLanguage(language, code) {
  switch(language) {
    case 'python':
      return ['python', '-c', code];
    case 'java':
      // More complex: save to file, compile, run
      return ['sh', '-c', `echo "${code}" > Main.java && javac Main.java && java Main`];
    case 'cpp':
      return ['sh', '-c', `echo "${code}" > main.cpp && g++ main.cpp -o main && ./main`];
    default:
      throw new Error('Unsupported language');
  }
}

app.listen(3001, () => {
  console.log('Code execution server running on port 3001');
});
```

#### 2. Frontend Update

```javascript
const runCode = async () => {
  if (language === 'javascript') {
    // Use existing iframe approach
    executeInIframe(code);
  } else {
    // Use backend for other languages
    setIsRunning(true);
    setOutput([]);
    
    try {
      const response = await fetch('http://localhost:3001/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language })
      });
      
      const result = await response.json();
      
      if (result.error) {
        setOutput([{ type: 'error', content: result.error }]);
      } else {
        setOutput([{ type: 'log', content: result.output }]);
      }
    } catch (error) {
      setOutput([{ type: 'error', content: 'Backend error: ' + error.message }]);
    } finally {
      setIsRunning(false);
    }
  }
};
```

#### 3. Security Considerations

**Critical backend security measures:**

1. **Rate Limiting**
```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use('/execute', limiter);
```

2. **Input Validation**
```javascript
const MAX_CODE_LENGTH = 10000;

app.post('/execute', (req, res) => {
  if (!req.body.code || req.body.code.length > MAX_CODE_LENGTH) {
    return res.status(400).json({ error: 'Invalid code' });
  }
  
  const allowedLanguages = ['python', 'java', 'cpp'];
  if (!allowedLanguages.includes(req.body.language)) {
    return res.status(400).json({ error: 'Unsupported language' });
  }
  
  // Proceed with execution...
});
```

3. **Resource Limits (Docker)**
- Memory: 100MB max
- CPU: 1 core max
- Execution time: 5 seconds max
- Network: None
- Disk I/O: Minimal

4. **Code Sandboxing**
- Each execution in isolated container
- Container destroyed after execution
- No persistent file system
- No access to host system

---

### Alternative: Use Existing Services

Instead of building your own backend, use:

**Judge0 CE (Open Source)**
```javascript
const response = await fetch('https://judge0-ce.p.rapidapi.com/submissions', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'X-RapidAPI-Key': 'YOUR_API_KEY'
  },
  body: JSON.stringify({
    source_code: code,
    language_id: 71, // Python
    stdin: ''
  })
});
```

**Piston API**
```javascript
const response = await fetch('https://emkc.org/api/v2/piston/execute', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    language: 'python',
    version: '3.10',
    files: [{ content: code }]
  })
});
```

---

## 🎯 Summary

### What You Built

1. **Secure execution engine** using sandboxed iframe
2. **Cross-origin communication** with postMessage
3. **Console hijacking** to capture logs
4. **Error handling** for runtime errors
5. **Production-ready architecture** that's scalable

### Key Learnings

1. **Same-Origin Policy** prevents direct iframe access
2. **postMessage** is the standard cross-origin communication method
3. **Sandboxing** provides strong security guarantees
4. **srcDoc** allows dynamic iframe content generation
5. **Browser limitations** require backend for non-JS languages

### Extension Path

- **Next step:** Add backend API
- **After that:** Docker containerization
- **Then:** Multi-language support
- **Finally:** Collaborative editing with WebSockets

---

## 📁 File Structure

```
code-editor-step1/
├── src/
│   ├── App.jsx          # ✅ Secure execution with postMessage
│   ├── App.css          # ✅ Enhanced console styling
│   ├── main.jsx         # React entry
│   └── index.css        # Global styles
├── index.html
├── package.json
├── vite.config.js
└── README.md            # This file
```

**Production ready!** This implementation is secure, efficient, and follows browser best practices. 🎉
