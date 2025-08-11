import React, { useState, useEffect } from 'react';

export default function App() {
  const [walletBalances, setWalletBalances] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [balancesRes, productsRes] = await Promise.all([
          fetch('/api/dashboard').then(r => r.json()),
          fetch('/api/shopify/products').then(r => r.json())
        ]);
        setWalletBalances(balancesRes);
        setProducts(productsRes);
      } catch (err) {
        console.error("Failed to fetch data:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) return <div className="p-4">Loading dashboard...</div>;

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <h1 className="text-3xl font-bold mb-6 text-gray-800">Arielmatrix2.0 Dashboard</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* USDT Wallet Balances */}
        <div className="bg-white p-6 rounded-xl shadow-lg border">
          <h2 className="text-xl font-semibold mb-4 text-gray-700">USDT Wallet Balances</h2>
          {walletBalances.length === 0 ? (
            <p className="text-gray-500">No balances available</p>
          ) : (
            <ul className="space-y-3">
              {walletBalances.map(({ wallet, balance }) => (
                <li key={wallet} className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-sm text-gray-600 truncate max-w-xs">{wallet}</span>
                  <span className="font-medium">${balance?.toFixed(2)} USDT</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Shopify Products */}
        <div className="bg-white p-6 rounded-xl shadow-lg border">
          <h2 className="text-xl font-semibold mb-4 text-gray-700">Shopify Products</h2>
          {products.length === 0 ? (
            <p className="text-gray-500">No products available</p>
          ) : (
            <ul className="space-y-3">
              {products.map((product) => (
                <li key={product.id} className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-sm font-medium">{product.title}</span>
                  <span className="text-green-600">${product.variants[0].price}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
