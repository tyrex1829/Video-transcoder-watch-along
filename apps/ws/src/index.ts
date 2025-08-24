import WebSocket, { RawData } from "ws";
import http from "http";
import path from "path";

const wss = new WebSocket.Server({ port: 8080 });

// Store room data
const rooms = new Map<string, Room>();

// Message type definitions
interface Message {
  type: string;
  roomId?: string;
  userId?: string;
  videoUrl?: string;
  currentTime?: number;
  isPlaying?: boolean;
  timestamp?: number;
}

// Serve static files

// Room data structure
class Room {
  id: string;
  hostId: string;
  clients: Map<string, { ws: WebSocket; userId: string; isHost: boolean }>;
  videoUrl: string | null;
  currentTime: number;
  isPlaying: boolean;
  lastUpdateTime: number;

  constructor(id: string, hostId: string) {
    this.id = id;
    this.hostId = hostId;
    this.clients = new Map();
    this.videoUrl = null;
    this.currentTime = 0;
    this.isPlaying = false;
    this.lastUpdateTime = Date.now();
  }

  addClient(ws: WebSocket, userId: string) {
    this.clients.set(userId, {
      ws: ws,
      userId: userId,
      isHost: userId === this.hostId,
    });
  }

  removeClient(userId: string) {
    this.clients.delete(userId);
  }

  broadcast(message: any, excludeUserId: string | null = null) {
    this.clients.forEach((client, userId) => {
      if (userId !== excludeUserId && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify(message));
      }
    });
  }

  updateVideoState(currentTime: number, isPlaying: boolean) {
    this.currentTime = currentTime;
    this.isPlaying = isPlaying;
    this.lastUpdateTime = Date.now();
  }

  getCurrentTime(): number {
    if (this.isPlaying) {
      const timePassed = (Date.now() - this.lastUpdateTime) / 1000;
      return this.currentTime + timePassed;
    }
    return this.currentTime;
  }
}

wss.on("connection", (ws) => {
  let userId: string | null = null;
  let roomId: string | null = null;

  ws.on("message", (data: RawData) => {
    try {
      const message: Message = JSON.parse(data.toString());

      switch (message.type) {
        case "create_room":
          roomId = message.roomId || null;
          userId = message.userId || null;

          if (!roomId || !userId) {
            ws.send(
              JSON.stringify({
                type: "error",
                message: "Room ID and User ID are required",
              })
            );
            return;
          }

          if (rooms.has(roomId)) {
            ws.send(
              JSON.stringify({
                type: "error",
                message: "Room already exists",
              })
            );
            return;
          }

          const room = new Room(roomId, userId);
          rooms.set(roomId, room);
          room.addClient(ws, userId);

          ws.send(
            JSON.stringify({
              type: "room_created",
              roomId: roomId,
              isHost: true,
            })
          );
          break;

        case "join_room":
          roomId = message.roomId || null;
          userId = message.userId || null;

          if (!roomId || !userId) {
            ws.send(
              JSON.stringify({
                type: "error",
                message: "Room ID and User ID are required",
              })
            );
            return;
          }

          if (!rooms.has(roomId)) {
            ws.send(
              JSON.stringify({
                type: "error",
                message: "Room not found",
              })
            );
            return;
          }

          const targetRoom = rooms.get(roomId)!;
          targetRoom.addClient(ws, userId);

          // Send current room state to new user
          ws.send(
            JSON.stringify({
              type: "room_joined",
              roomId: roomId,
              isHost: userId === targetRoom.hostId,
              videoUrl: targetRoom.videoUrl,
              currentTime: targetRoom.getCurrentTime(),
              isPlaying: targetRoom.isPlaying,
              userCount: targetRoom.clients.size,
            })
          );

          // Notify other users
          targetRoom.broadcast(
            {
              type: "user_joined",
              userId: userId,
              userCount: targetRoom.clients.size,
            },
            userId
          );
          break;

        case "set_video":
          if (roomId && rooms.has(roomId as string)) {
            const room = rooms.get(roomId as string)!;
            const client = room.clients.get(userId as string);

            if (client && client.isHost) {
              room.videoUrl = message.videoUrl || null;
              room.updateVideoState(0, false);

              room.broadcast({
                type: "video_set",
                videoUrl: message.videoUrl,
                currentTime: 0,
                isPlaying: false,
              });
            } else {
              ws.send(
                JSON.stringify({
                  type: "error",
                  message: "Only host can set video",
                })
              );
            }
          }
          break;

        case "play":
          if (roomId && rooms.has(roomId)) {
            const room = rooms.get(roomId as string)!;
            const client = room.clients.get(userId as string);

            if (client && client.isHost) {
              room.updateVideoState(message.currentTime || 0, true);

              room.broadcast({
                type: "play",
                currentTime: message.currentTime,
                timestamp: Date.now(),
              });
            }
          }
          break;

        case "pause":
          if (roomId && rooms.has(roomId)) {
            const room = rooms.get(roomId as string)!;
            const client = room.clients.get(userId as string);

            if (client && client.isHost) {
              room.updateVideoState(message.currentTime || 0, false);

              room.broadcast({
                type: "pause",
                currentTime: message.currentTime,
              });
            }
          }
          break;

        case "seek":
          if (roomId && rooms.has(roomId)) {
            const room = rooms.get(roomId as string)!;
            const client = room.clients.get(userId as string);

            if (client && client.isHost) {
              room.updateVideoState(message.currentTime || 0, room.isPlaying);

              room.broadcast({
                type: "seek",
                currentTime: message.currentTime,
                isPlaying: room.isPlaying,
                timestamp: Date.now(),
              });
            }
          }
          break;

        case "user_play":
          // User wants to sync their video with the room
          if (roomId && rooms.has(roomId)) {
            const room = rooms.get(roomId as string)!;

            ws.send(
              JSON.stringify({
                type: "sync",
                currentTime: room.getCurrentTime(),
                isPlaying: room.isPlaying,
                timestamp: Date.now(),
              })
            );
          }
          break;

        case "heartbeat":
          ws.send(JSON.stringify({ type: "heartbeat" }));
          break;
      }
    } catch (error) {
      console.error("Error processing message:", error);
      ws.send(
        JSON.stringify({
          type: "error",
          message: "Invalid message format",
        })
      );
    }
  });

  ws.on("close", () => {
    if (roomId && userId && rooms.has(roomId)) {
      const room = rooms.get(roomId)!;
      room.removeClient(userId);

      if (room.clients.size === 0) {
        // Delete empty room
        rooms.delete(roomId);
      } else {
        // Notify remaining users
        room.broadcast({
          type: "user_left",
          userId: userId,
          userCount: room.clients.size,
        });

        // If host left, assign new host
        if (userId === room.hostId && room.clients.size > 0) {
          const newHostId = room.clients.keys().next().value as string;
          room.hostId = newHostId;

          room.broadcast({
            type: "new_host",
            hostId: newHostId,
          });
        }
      }
    }
  });

  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
  });
});
