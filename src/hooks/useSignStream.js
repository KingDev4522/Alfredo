import { useState, useEffect, useRef, useCallback } from 'react';
import { WS_URL } from '../lib/supabaseClient';

export function useSignStream() {
  const [status, setStatus] = useState('disconnected');
  const [progress, setProgress] = useState(0);
  const [currentJobId, setCurrentJobId] = useState(null);
  
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  
  const animationQueueRef = useRef([]);
  const queueHeadRef = useRef(0);
  
  const jobIdRef = useRef(null);
  const lastChunkIdRef = useRef(-1);

  const connect = useCallback((job_id) => {
    jobIdRef.current = job_id;
    setCurrentJobId(job_id);
    
    if (wsRef.current) {
      wsRef.current.close();
    }
    
    setStatus('connecting');
    
    const resumeFrom = Math.max(0, lastChunkIdRef.current + 1);
    const ws = new WebSocket(`${WS_URL}?job_id=${job_id}&resume_from=${resumeFrom}`);
    
    ws.onopen = () => {
      setStatus('connected');
      reconnectAttemptsRef.current = 0;
    };
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'progress') {
          setProgress(data.percent);
        } else if (data.type === 'pose_chunk') {
          // Inject job_id into chunk so Avatar can send ACKs properly
          data.job_id = job_id;
          animationQueueRef.current.push(data);
          lastChunkIdRef.current = Math.max(lastChunkIdRef.current, data.chunk_id);
          if (data.is_last_chunk) {
            jobIdRef.current = null; // Prevent reconnect loop
            lastChunkIdRef.current = -1; // Reset cursor for next job
          }
        }
      } catch (err) {
        console.error("Failed to parse websocket message", err);
      }
    };
    
    ws.onclose = () => {
      setStatus('disconnected');
      
      // Exponential backoff reconnect
      if (jobIdRef.current) {
        const attempts = reconnectAttemptsRef.current;
        // Backoff: 2s, 4s, 8s, up to 30s
        const backoffMs = Math.min(30000, Math.pow(2, attempts + 1) * 1000);
        console.log(`WebSocket disconnected. Reconnecting in ${backoffMs}ms...`);
        
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectAttemptsRef.current += 1;
          connect(jobIdRef.current);
        }, backoffMs);
      }
    };
    
    ws.onerror = (err) => {
      console.error("WebSocket error", err);
      ws.close();
    };
    
    wsRef.current = ws;
  }, []);
  
  const disconnect = useCallback(() => {
    jobIdRef.current = null;
    setCurrentJobId(null);
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (wsRef.current) {
      wsRef.current.close();
    }
    // Do NOT clear animationQueueRef so renderer can finish consuming downloaded chunks safely.
  }, []);
  
  const sendAck = useCallback((job_id, chunk_id) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'ack',
        job_id,
        chunk_id
      }));
    }
  }, []);
  
  const consumeNextChunk = useCallback(() => {
    const head = queueHeadRef.current;
    if (head < animationQueueRef.current.length) {
      const chunk = animationQueueRef.current[head];
      queueHeadRef.current += 1;
      
      // Memory Leak Prevention: Splice the array when queueHead gets too large
      if (queueHeadRef.current > 100) {
        animationQueueRef.current.splice(0, queueHeadRef.current);
        queueHeadRef.current = 0;
      }
      
      return chunk;
    }
    return null;
  }, []);

  const peekNextChunk = useCallback(() => {
    const head = queueHeadRef.current;
    if (head < animationQueueRef.current.length) {
      return animationQueueRef.current[head];
    }
    return null;
  }, []);
  
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    status,
    progress,
    currentJobId,
    connect,
    disconnect,
    sendAck,
    consumeNextChunk,
    peekNextChunk,
    getQueueLength: () => animationQueueRef.current.length - queueHeadRef.current
  };
}
