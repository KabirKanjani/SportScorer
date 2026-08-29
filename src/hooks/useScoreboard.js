import { useEffect, useRef, useState, useCallback } from 'react';
import { api, wsUrl } from '../api.js';

// Hook that connects to the real-time scoreboard for a specific match.
// Server is authoritative; commands go over WebSocket (with HTTP fallback).
export function useScoreboard(matchId) {
  const [state, setState] = useState(null);
  const [meta, setMeta] = useState(null);
  const [events, setEvents] = useState([]);
  const [connected, setConnected] = useState(false);
  const [canScore, setCanScore] = useState(false);
  const [error, setError] = useState(null);

  const wsRef = useRef(null);
  const matchRef = useRef(matchId);
  matchRef.current = matchId;

  useEffect(() => {
    if (!matchId) return undefined;
    let ws;
    let closed = false;
    const reconnect = () => {
      if (closed) return;
      ws = new WebSocket(wsUrl(matchId));
      wsRef.current = ws;
      ws.onopen = () => setConnected(true);
      ws.onmessage = (ev) => {
        let msg;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (msg.type === 'init') {
          setState(msg.state);
          setMeta(msg.match);
          setCanScore(!!msg.canScore);
          setEvents(msg.events || []);
        } else if (msg.type === 'state') {
          setState(msg.state);
        } else if (msg.type === 'meta') {
          setMeta(msg.summary);
        } else if (msg.type === 'events') {
          setEvents(msg.events || []);
        } else if (msg.type === 'error') {
          setError(msg.error);
        }
      };
      ws.onclose = () => {
        setConnected(false);
        if (!closed) setTimeout(reconnect, 1500);
      };
      ws.onerror = () => {};
    };
    reconnect();
    return () => {
      closed = true;
      if (ws) ws.close();
    };
  }, [matchId]);

  const sendCommand = useCallback(
    async (action) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'cmd', action }));
        return;
      }
      // Fallback over HTTP
      await api(`/api/matches/${matchRef.current}/action`, {
        method: 'POST',
        body: { action },
      });
    },
    []
  );

  const pointFor = useCallback((player) => sendCommand({ type: 'point', player }), [sendCommand]);
  const doUndo = useCallback(() => sendCommand({ type: 'undo' }), [sendCommand]);
  const doReset = useCallback(() => sendCommand({ type: 'reset' }), [sendCommand]);
  const doSwap = useCallback(() => sendCommand({ type: 'swap' }), [sendCommand]);
  const recordDetail = useCallback(
    ({ detail, key, player }) => sendCommand({ type: 'detail', detail, key, player }),
    [sendCommand]
  );
  const startMatch = useCallback(async () => {
    await api(`/api/matches/${matchRef.current}/start`, { method: 'POST' });
  }, []);
  const setToss = useCallback(async (t) => {
    await api(`/api/matches/${matchRef.current}/toss`, { method: 'POST', body: t });
  }, []);

  return {
    state,
    meta,
    events,
    connected,
    canScore,
    error,
    pointFor,
    doUndo,
    doReset,
    doSwap,
    recordDetail,
    startMatch,
    setToss,
  };
}