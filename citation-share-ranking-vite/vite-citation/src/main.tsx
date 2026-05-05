import React from "react";
import ReactDOM from "react-dom/client";
import { CitationShareRanking } from "./CitationShareRanking";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <div className="min-h-screen bg-background p-8 flex items-center justify-center">
      <div className="w-full max-w-md">
        <CitationShareRanking />
      </div>
    </div>
  </React.StrictMode>
);
