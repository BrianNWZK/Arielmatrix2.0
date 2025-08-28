import React, { useState } from 'react';
import BwaeziDashboard from './components/BwaeziDashboard';
import './index.css'; // Updated to use index.css

function App() {
  const [user] = useState({ id: 'user-123', name: 'Demo User' });

  return (
    <div className="App">
      <header className="app-header">
        <h1>ArielMatrix 2.0 - Bwaezi Chain Integrated</h1>
      </header>
      
      <main>
        <BwaeziDashboard userId={user.id} />
        {/* Existing dashboard components */}
      </main>
    </div>
  );
}

export default App;
