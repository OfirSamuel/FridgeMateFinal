import "./config/env";
import http from "http";
import app from "./app";
import { Server } from "socket.io";
import { setupSocketHandlers } from "./socket/socket-handlers";
import { connectDB } from "./config/database";

const PORT = process.env.PORT || 3001;
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});
setupSocketHandlers(io);

const start = async () => {
  try {
    await connectDB();
  } catch (error) {
    console.error("Failed to start server:", (error as Error).message);
    process.exit(1);
  }

  server.listen(PORT, () => {
    console.log(`Server is listening on port: ${PORT}\n`);
    console.log(`Swagger docs available at http://localhost:${PORT}/api-docs`);
  });
};

if (require.main === module) {
  start();
}

export { io, server };
export default app;
