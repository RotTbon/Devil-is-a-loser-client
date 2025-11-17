// server.js – WebSocket + Secure headers (Trustwave fix)

import express from "express";
import { WebSocketServer } from "ws";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.static(__dirname));

// Security headers (phishing fix)
app.use((req, res, next) => {
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

const server = http.createServer(app);

// REAL WebSocket server
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (socket) => {
  console.log("client connected");

  socket.on("message", (msg) => {
    // broadcast to all
    for (const client of wss.clients) {
      if (client.readyState === 1) client.send(msg.toString());
    }
  });

  socket.on("close", () => console.log("client left"));
});

const port = process.env.PORT || 3000;
server.listen(port, () => console.log("WS server running on " + port));
