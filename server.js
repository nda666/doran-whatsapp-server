// import express, { Express, Request, Response } from "express";
// import * as http from "http";
// import next, { NextApiHandler } from "next";
// import * as socketio from "socket.io";

const express = require("express");
const http = require("http");
const next = require("next");
const socketio = require("socket.io");

const hostname = "localhost";
const port = parseInt(process.env.PORT || "3000", 10);
const dev = process.env.NODE_ENV !== "production";
const nextApp = next({ dev, hostname, port });
const nextHandler = nextApp.getRequestHandler();

nextApp.prepare().then(async () => {
  const app = express();
  const server = http.createServer(app);
  const io = new socketio.Server({
    path: "/socket.io",
  });
  io.attach(server);

  app.get("/hello", async (_, res) => {
    res.send("Hello World");
  });

  io.on("connection", (socket) => {
    console.log("connection");
    socket.emit("status", "Hello from Socket.io");

    socket.on("disconnect", () => {
      console.log("client disconnected");
    });
  });

  app.all("*", (req, res) => nextHandler(req, res));

  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
});
