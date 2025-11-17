const http = require("http");
const WebSocket = require("ws");
const path = require("path");
const fs = require("fs");

const server = http.createServer((req, res) => {
    // Güvenlik headerları – phishing uyarısını azaltır
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");

    let filePath = path.join(__dirname, req.url === "/" ? "index.html" : req.url);

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            return res.end("Not Found");
        }
        res.writeHead(200);
        res.end(data);
    });
});

const wss = new WebSocket.Server({ server });

wss.on("connection", socket => {
    socket.on("message", msg => {
        // Herkese mesaj gönder (canlı chat)
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(msg);
            }
        });
    });
});

server.listen(3000, () => {
    console.log("Server çalışıyor: http://localhost:3000");
});
