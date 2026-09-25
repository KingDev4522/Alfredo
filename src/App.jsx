import { Routes, Route } from "react-router-dom";
import { Navbar } from "./components/Navbar";
import { ScrollToTop } from "./components/ScrollToTop";
import { HomePage } from "./pages/HomePage";
import { InterpretPage } from "./pages/InterpretPage";
import { RecordPage } from "./pages/RecordPage";
import { DeletePage } from "./pages/DeletePage";

function App() {
  return (
    <div
      className="min-h-screen w-full flex flex-col items-center"
      style={{ fontFamily: "Inter, sans-serif", color: "#F2F4F8", backgroundColor: "#050505" }}
    >
      <ScrollToTop />
      <Navbar />

      <main className="w-full flex-1 flex flex-col items-center">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/interpret" element={<InterpretPage />} />
          <Route path="/record" element={<RecordPage />} />
          <Route path="/delete" element={<DeletePage />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
