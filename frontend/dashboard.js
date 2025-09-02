<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ArielSQL Dashboard</title>
    <!-- Use Tailwind CSS for a modern, responsive design -->
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
      body {
        font-family: 'Inter', sans-serif;
        background-color: #1a202c; /* Dark background */
        color: #e2e8f0; /* Light text */
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 100vh;
        padding: 1rem;
      }
      .container {
        @apply w-full max-w-4xl p-8 bg-gray-800 rounded-2xl shadow-xl space-y-8;
      }
      .card {
        @apply p-6 bg-gray-700 rounded-xl shadow-lg transition-all duration-300 ease-in-out hover:shadow-2xl;
      }
      h1 {
        @apply text-4xl font-extrabold text-blue-400 text-center mb-6;
      }
      h3 {
        @apply text-2xl font-semibold mb-4 text-blue-300;
      }
      p, li {
        @apply text-gray-300 text-lg;
      }
      ul {
        @apply list-disc list-inside space-y-2;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>ArielSQL Suite Dashboard</h1>
      <div id="status" class="card">
        <h3>Service Status</h3>
        <p>Loading status...</p>
      </div>
      <div id="logs" class="card">
        <h3>System Logs</h3>
        <pre class="whitespace-pre-wrap font-mono text-sm text-gray-400">Loading logs...</pre>
      </div>
      <div id="walletBalances" class="card">
        <h3>USDT Wallet Balances</h3>
        <p>Loading balances...</p>
      </div>
      <div id="products" class="card">
        <h3>Shopify Products</h3>
        <p>Loading products...</p>
      </div>
      <div id="bitcoinPrice" class="card">
        <h3>Bitcoin Price (USD)</h3>
        <p>Loading price...</p>
      </div>
    </div>

    <script>
      document.addEventListener("DOMContentLoaded", () => {
        const statusDiv = document.getElementById("status");
        const logsDiv = document.getElementById("logs");

        const walletBalancesDiv = document.getElementById("walletBalances");
        const productsDiv = document.getElementById("products");
        const bitcoinPriceDiv = document.getElementById("bitcoinPrice");

        // Helper function to handle fetch and errors
        async function fetchData(url, successCallback, errorCallback) {
          try {
            const response = await fetch(url);
            if (!response.ok) {
              throw new Error("Network response was not ok");
            }
            const data = await response.json();
            successCallback(data);
          } catch (error) {
            console.error(`Error fetching from ${url}:`, error);
            errorCallback(error);
          }
        }

        // Fetch service status from /health endpoint
        fetchData(
          "/api/health",
          (data) => {
            statusDiv.innerHTML = `<h3>Service Status</h3><p>Status: ${data.status}</p><p>Uptime: ${data.uptime.toFixed(2)}s</p>`;
          },
          (error) => {
            statusDiv.innerHTML = `<h3>Service Status</h3><p>Error fetching status: ${error.message}</p>`;
          }
        );

        // Fetch logs from /api/logs endpoint
        fetchData(
          "/api/logs",
          (data) => {
            if (Array.isArray(data.logs)) {
              logsDiv.querySelector("pre").textContent = data.logs.join("\n");
            } else {
              logsDiv.querySelector("pre").textContent = data.message || "No logs available.";
            }
          },
          (error) => {
            logsDiv.querySelector("pre").textContent = `Error fetching logs: ${error.message}`;
          }
        );

        // Fetch USDT wallet balances from /dashboard endpoint
        fetchData(
          "/api/dashboard",
          (data) => {
            walletBalancesDiv.innerHTML = `<h3>USDT Wallet Balances</h3><p>${data.message}</p>`;
          },
          (error) => {
            walletBalancesDiv.innerHTML = `<h3>USDT Wallet Balances</h3><p>Error fetching wallet balances: ${error.message}</p>`;
          }
        );

        // Fetch Shopify products from /api/shopify/products endpoint
        fetchData(
          "/api/shopify/products",
          (data) => {
            productsDiv.innerHTML = `<h3>Shopify Products</h3><p>${data.message}</p>`;
          },
          (error) => {
            productsDiv.innerHTML = `<h3>Shopify Products</h3><p>Error fetching products: ${error.message}</p>`;
          }
        );

        // Fetch Bitcoin price from /api/bitcoin-price endpoint
        fetchData(
          "/api/bitcoin-price",
          (data) => {
            const price = data.price;
            bitcoinPriceDiv.innerHTML = `<h3>Bitcoin Price (USD)</h3><p>${price ? `$${price.toLocaleString()}` : "N/A"}</p>`;
          },
          (error) => {
            bitcoinPriceDiv.innerHTML = `<h3>Bitcoin Price (USD)</h3><p>Error fetching price: ${error.message}</p>`;
          }
        );
      });
    </script>
  </body>
</html>
