import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { type HomeEndpoint, type EndpointRes } from "shared";
import UploadForm from "@/components/UploadForm";
import "./App.css";

const fetchHome = async (): Promise<EndpointRes<HomeEndpoint>> => {
    const res = await fetch("/api");
    if (!res.ok) {
        throw new Error(`Request failed: ${res.status}`);
    }
    return res.json();
};

function App() {
    const [count, setCount] = useState(0);
    const { data, isLoading, isError } = useQuery({ queryKey: ["home"], queryFn: fetchHome });

    let backendMessage = data?.message;
    if (isLoading) {
        backendMessage = "Loading...";
    } else if (isError) {
        backendMessage = "Error";
    }

    return (
        <main style={{ padding: "2rem", maxWidth: "40rem", margin: "0 auto" }}>
            <h1>Frontend</h1>
            <p>Backend says: {backendMessage}</p>
            <button type="button" className="counter" onClick={() => setCount((current) => current + 1)}>
                Count is {count}
            </button>
            <UploadForm />
        </main>
    );
}

export default App;
