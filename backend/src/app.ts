import express, { type Express, type Request, type Response } from "express";
import { type HomeEndpoint, type EndpointRes } from "shared";

const app: Express = express();

app.get("/api", (req: Request, res: Response) => {
    const body: EndpointRes<HomeEndpoint> = { message: "Hello World!" };
    res.json(body);
});

app.listen(3000);
