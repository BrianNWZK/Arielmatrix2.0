import React, { useState, useEffect } from 'react';

const BwaeziDashboard = ({ userId }) => {
    const [balance, setBalance] = useState(0);
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchBwaeziData();
    }, [userId]);

    const fetchBwaeziData = async () => {
        try {
            const [balanceRes, transactionsRes] = await Promise.all([
                fetch(`/api/balance/${userId}?currency=BWAEZI`),
                fetch(`/api/transactions/${userId}?limit=10`)
            ]);

            const balanceData = await balanceRes.json();
            const transactionsData = await transactionsRes.json();

            setBalance(balanceData.balance);
            setTransactions(transactionsData);
        } catch (error) {
            console.error('Failed to fetch Bwaezi data:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="loading">Loading Bwaezi data...</div>;

    return (
        <div className="bwaezi-dashboard">
            <h3>Bwaezi Chain Dashboard</h3>
            
            <div className="balance-card">
                <h4>Current Balance</h4>
                <div className="balance-amount">{balance} BWAEZI</div>
            </div>

            <div className="transactions-section">
                <h4>Recent Transactions</h4>
                {transactions.map(tx => (
                    <div key={tx.id} className="transaction-item">
                        <span className="tx-type">{tx.type}</span>
                        <span className="tx-amount">{tx.amount} BWAEZI</span>
                        <span className="tx-time">{new Date(tx.timestamp).toLocaleString()}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default BwaeziDashboard;
