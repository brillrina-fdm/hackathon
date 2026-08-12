import express, { type Express, type Request, type Response } from "express";
import { type EndpointRes, type PingEndpoint } from "shared";

const app: Express = express();
app.disable("x-powered-by");

app.get("/ping", (req: Request, res: Response) => {
    const body: EndpointRes<PingEndpoint> = { message: "pong" };
    res.json(body);
});

app.listen(3000);
