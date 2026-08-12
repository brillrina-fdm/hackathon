export type Endpoint<T = void, U = void> = {
    req: T;
    res: U;
};

export type EndpointReq<E> = E extends Endpoint<infer T, unknown> ? T : never;

export type EndpointRes<E> = E extends Endpoint<unknown, infer U> ? U : never;

export type PingEndpoint = Endpoint<void, { message: "pong" }>;
