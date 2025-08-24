"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";

// Message type definitions to match WebSocket server
interface WebSocketMessage {
  type: string;
  roomId?: string;
  userId?: string;
  isHost?: boolean;
  videoUrl?: string;
  currentTime?: number;
  isPlaying?: boolean;
  timestamp?: number;
  userCount?: number;
  hostId?: string;
  message?: string;
}

const SyncVideoPlayer = () => {
  // State management
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string>(
    `User_${Math.random().toString(36).substr(2, 5)}`
  );
  const [roomId, setRoomId] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [userCount, setUserCount] = useState(0);
  const [videoStatus, setVideoStatus] = useState("No video");
  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState("error");

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const ignoreVideoEventsRef = useRef(false);
  const lastSyncTimeRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Utility functions
  const showError = useCallback((message: string, type = "error") => {
    setError(message);
    setErrorType(type);
    setTimeout(() => setError(null), 5000);
  }, []);

  // Handle WebSocket messages
  const handleMessage = useCallback(
    (message: WebSocketMessage) => {
      switch (message.type) {
        case "room_created":
          setCurrentRoomId(message.roomId || null);
          setIsHost(true);
          showError("Room created successfully!", "success");
          break;

        case "room_joined":
          setCurrentRoomId(message.roomId || null);
          setIsHost(message.isHost || false);

          if (message.videoUrl) {
            loadVideo(message.videoUrl);
            syncVideoTime(message.currentTime || 0, message.isPlaying || false);
          }

          setUserCount(message.userCount || 0);
          showError("Joined room successfully!", "success");
          break;

        case "video_set":
          if (message.videoUrl) {
            loadVideo(message.videoUrl);
            syncVideoTime(message.currentTime || 0, message.isPlaying || false);
          }
          break;

        case "play":
          syncVideoTime(
            message.currentTime || 0,
            true,
            message.timestamp || null
          );
          break;

        case "pause":
          syncVideoTime(message.currentTime || 0, false);
          break;

        case "seek":
          syncVideoTime(
            message.currentTime || 0,
            message.isPlaying || false,
            message.timestamp || null
          );
          break;

        case "sync":
          syncVideoTime(
            message.currentTime || 0,
            message.isPlaying || false,
            message.timestamp || null
          );
          break;

        case "user_joined":
          setUserCount(message.userCount || 0);
          break;

        case "user_left":
          setUserCount(message.userCount || 0);
          break;

        case "new_host":
          if (message.hostId === userId) {
            setIsHost(true);
            showError("You are now the host!", "success");
          }
          break;

        case "error":
          showError(message.message || "Unknown error");
          break;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId]
  );

  // Video functions
  const loadVideo = useCallback(
    (url: string) => {
      if (url.includes("youtube.com") || url.includes("youtu.be")) {
        showError(
          "For YouTube videos, please use a direct video link or use an embedded player"
        );
        return;
      }

      if (videoRef.current) {
        videoRef.current.src = url;
        videoRef.current.load();
        setVideoStatus("Video loaded");
      }
    },
    [showError]
  );

  const syncVideoTime = useCallback(
    (
      currentTime: number,
      isPlaying: boolean,
      timestamp: number | null = null
    ) => {
      if (!videoRef.current) return;

      ignoreVideoEventsRef.current = true;

      // Adjust for network latency if timestamp provided
      if (timestamp && isPlaying) {
        const latency = (Date.now() - timestamp) / 1000;
        currentTime += latency;
      }

      videoRef.current.currentTime = currentTime;

      if (isPlaying && videoRef.current.paused) {
        videoRef.current.play().catch(console.error);
      } else if (!isPlaying && !videoRef.current.paused) {
        videoRef.current.pause();
      }

      lastSyncTimeRef.current = Date.now();

      setTimeout(() => {
        ignoreVideoEventsRef.current = false;
      }, 1000);

      setVideoStatus(isPlaying ? "Playing" : "Paused");
    },
    []
  );

  // WebSocket connection
  const connect = useCallback(() => {
    const protocol =
      typeof window !== "undefined" && window.location.protocol === "https:"
        ? "wss:"
        : "ws:";
    // Connect to WebSocket server on port 8080
    const wsUrl = `${protocol}//localhost:8080`;

    const newWs = new WebSocket(wsUrl);

    newWs.onopen = () => {
      setIsConnected(true);
      setError(null);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };

    newWs.onmessage = (event) => {
      const message = JSON.parse(event.data);
      handleMessage(message);
    };

    newWs.onclose = () => {
      setIsConnected(false);
      reconnectTimeoutRef.current = setTimeout(connect, 3000);
    };

    newWs.onerror = (error) => {
      console.error("WebSocket error:", error);
      showError("Connection error. Retrying...");
    };

    setWs(newWs);
  }, [handleMessage, showError]);

  // Room functions
  const createRoom = useCallback(() => {
    if (!isConnected) {
      connect();
      setTimeout(createRoom, 1000);
      return;
    }

    if (!roomId.trim() || !userId.trim()) {
      showError("Please enter both name and room ID");
      return;
    }

    if (ws) {
      ws.send(
        JSON.stringify({
          type: "create_room",
          roomId: roomId.trim(),
          userId: userId.trim(),
        })
      );
    }
  }, [isConnected, roomId, userId, ws, connect, showError]);

  const joinRoom = useCallback(() => {
    if (!isConnected) {
      connect();
      setTimeout(joinRoom, 1000);
      return;
    }

    if (!roomId.trim() || !userId.trim()) {
      showError("Please enter both name and room ID");
      return;
    }

    if (ws) {
      ws.send(
        JSON.stringify({
          type: "join_room",
          roomId: roomId.trim(),
          userId: userId.trim(),
        })
      );
    }
  }, [isConnected, roomId, userId, ws, connect, showError]);

  const setVideo = useCallback(() => {
    if (!isHost) {
      showError("Only the host can set the video");
      return;
    }

    if (!videoUrl.trim()) {
      showError("Please enter a video URL");
      return;
    }

    if (ws) {
      ws.send(
        JSON.stringify({
          type: "set_video",
          videoUrl: videoUrl.trim(),
        })
      );
    }
  }, [isHost, videoUrl, ws, showError]);

  const syncVideo = useCallback(() => {
    if (!currentRoomId) {
      showError("Not in a room");
      return;
    }

    if (ws) {
      ws.send(
        JSON.stringify({
          type: "user_play",
        })
      );
    }
  }, [currentRoomId, ws, showError]);

  // Video event handlers
  const handleVideoPlay = useCallback(() => {
    if (ignoreVideoEventsRef.current || !isHost || !ws) return;

    ws.send(
      JSON.stringify({
        type: "play",
        currentTime: videoRef.current?.currentTime || 0,
      })
    );
  }, [isHost, ws]);

  const handleVideoPause = useCallback(() => {
    if (ignoreVideoEventsRef.current || !isHost || !ws) return;

    ws.send(
      JSON.stringify({
        type: "pause",
        currentTime: videoRef.current?.currentTime || 0,
      })
    );
  }, [isHost, ws]);

  const handleVideoSeeked = useCallback(() => {
    if (ignoreVideoEventsRef.current || !isHost || !ws) return;

    ws.send(
      JSON.stringify({
        type: "seek",
        currentTime: videoRef.current?.currentTime || 0,
      })
    );
  }, [isHost, ws]);

  // Effects
  useEffect(() => {
    connect();

    // Cleanup on unmount
    return () => {
      if (ws) {
        ws.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connect, ws]);

  // Heartbeat
  useEffect(() => {
    const heartbeat = setInterval(() => {
      if (isConnected && ws) {
        ws.send(JSON.stringify({ type: "heartbeat" }));
      }
    }, 30000);

    return () => clearInterval(heartbeat);
  }, [isConnected, ws]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 text-white">
      <div className="max-w-6xl mx-auto p-5">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-bold mb-3 drop-shadow-lg">
            🎬 Sync Video Player
          </h1>
          <p className="text-lg opacity-90">
            Watch videos together in perfect sync
          </p>
        </div>

        {/* Controls */}
        <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-6 mb-6 border border-white/20">
          {error && (
            <div
              className={`p-4 rounded-lg mb-4 border ${
                errorType === "success"
                  ? "bg-green-500/20 text-green-100 border-green-500/30"
                  : "bg-red-500/20 text-red-100 border-red-500/30"
              }`}
            >
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block mb-2 font-medium">Your Name:</label>
              <input
                type="text"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="Enter your name"
                className="w-full p-3 rounded-lg bg-white/90 text-gray-800 border-0 focus:ring-2 focus:ring-purple-400 outline-none"
              />
            </div>
            <div>
              <label className="block mb-2 font-medium">Room ID:</label>
              <input
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                placeholder="Enter or create room ID"
                className="w-full p-3 rounded-lg bg-white/90 text-gray-800 border-0 focus:ring-2 focus:ring-purple-400 outline-none"
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <button
              onClick={createRoom}
              className="flex-1 bg-gradient-to-r from-pink-500 to-red-500 hover:from-pink-600 hover:to-red-600 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 transform hover:-translate-y-1 hover:shadow-lg"
            >
              Create Room
            </button>
            <button
              onClick={joinRoom}
              className="flex-1 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 transform hover:-translate-y-1 hover:shadow-lg"
            >
              Join Room
            </button>
          </div>

          {isHost && (
            <div className="border-t border-white/20 pt-4">
              <label className="block mb-2 font-medium">
                Video URL (YouTube, S3, or direct link):
              </label>
              <input
                type="text"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=... or direct video URL"
                className="w-full p-3 rounded-lg bg-white/90 text-gray-800 border-0 focus:ring-2 focus:ring-purple-400 outline-none mb-3"
              />
              <button
                onClick={setVideo}
                className="bg-gradient-to-r from-green-500 to-teal-500 hover:from-green-600 hover:to-teal-600 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 transform hover:-translate-y-1 hover:shadow-lg"
              >
                Set Video
              </button>
            </div>
          )}
        </div>

        {/* Video Container */}
        {currentRoomId && (
          <div className="bg-black/30 rounded-2xl p-6 mb-6">
            <video
              ref={videoRef}
              controls
              className="w-full max-w-4xl mx-auto rounded-lg block"
              onPlay={handleVideoPlay}
              onPause={handleVideoPause}
              onSeeked={handleVideoSeeked}
            >
              Your browser does not support the video tag.
            </video>

            <div className="text-center mt-4">
              <button
                onClick={syncVideo}
                className="bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 transform hover:-translate-y-1 hover:shadow-lg"
              >
                Sync with Room
              </button>
            </div>
          </div>
        )}

        {/* Status */}
        <div className="bg-white/10 backdrop-blur-xl rounded-xl p-6 border border-white/20">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="flex items-center justify-between">
              <span className="font-medium flex items-center">
                <span
                  className={`w-3 h-3 rounded-full mr-3 ${
                    isConnected ? "bg-green-400 animate-pulse" : "bg-red-400"
                  }`}
                ></span>
                Connection:
              </span>
              <span className="bg-white/20 px-3 py-1 rounded-full text-sm font-mono">
                {isConnected ? "Connected" : "Disconnected"}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="font-medium">Room:</span>
              <span className="bg-white/20 px-3 py-1 rounded-full text-sm font-mono">
                {currentRoomId || "Not in room"}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="font-medium">Role:</span>
              <span className="bg-white/20 px-3 py-1 rounded-full text-sm font-mono flex items-center">
                {isHost ? (
                  <>
                    Host
                    <span className="ml-2 bg-gradient-to-r from-yellow-400 to-orange-500 text-xs px-2 py-1 rounded-full text-black font-bold">
                      HOST
                    </span>
                  </>
                ) : (
                  "Viewer"
                )}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="font-medium">Users:</span>
              <span className="bg-white/20 px-3 py-1 rounded-full text-sm font-mono">
                {userCount}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="font-medium">Video:</span>
              <span className="bg-white/20 px-3 py-1 rounded-full text-sm font-mono">
                {videoStatus}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SyncVideoPlayer;
