import ChatInterface from "@/components/ChatInterface";
import fdmLogo from "@/assets/FDM_Logo_Green_RGB.png";
import "./App.css";

function App() {
    return (
        <>
            <header className="top-nav" aria-label="FDM navigation">
                <div className="top-nav__inner">
                    <img src={fdmLogo} alt="FDM" className="top-nav__logo" />
                </div>
            </header>

            <main className="app-shell">
                <ChatInterface />
            </main>
        </>
    );
}

export default App;
