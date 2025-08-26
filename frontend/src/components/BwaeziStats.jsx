import React from 'react';
import '../styles/BwaeziTheme.css';

const BwaeziStats = ({ stats }) => {
  const statItems = [
    {
      label: 'Total Balance',
      value: `${stats.totalBalance} BWAEZI`,
      icon: '💰',
      trend: stats.balanceTrend
    },
    {
      label: 'Transactions',
      value: stats.transactionCount.toLocaleString(),
      icon: '📊',
      trend: stats.txTrend
    },
    {
      label: 'Today Earnings',
      value: `${stats.todayEarnings} BWAEZI`,
      icon: '🎯',
      trend: stats.earningsTrend
    },
    {
      label: 'Active Agents',
      value: stats.activeAgents,
      icon: '🤖',
      trend: stats.agentsTrend
    }
  ];

  return (
    <div className="bwaezi-stats-grid">
      {statItems.map((stat, index) => (
        <div key={index} className="bwaezi-card stat-item">
          <div className="stat-icon" style={{ fontSize: '2rem', marginBottom: '10px' }}>
            {stat.icon}
          </div>
          <div className="stat-value">{stat.value}</div>
          <div className="stat-label">{stat.label}</div>
          {stat.trend && (
            <div className={`stat-trend ${stat.trend > 0 ? 'positive' : 'negative'}`}>
              {stat.trend > 0 ? '↗' : '↘'} {Math.abs(stat.trend)}%
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default BwaeziStats;
