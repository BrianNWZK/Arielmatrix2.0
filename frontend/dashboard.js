document.addEventListener("DOMContentLoaded", () => {
  const statusDiv = document.getElementById("status");
  const logsDiv = document.getElementById("logs");

  const walletBalancesDiv = document.createElement("div");
  const productsDiv = document.createElement("div");
  const bitcoinPriceDiv = document.createElement("div");

  // Append these new divs below status and logs if they exist
  if (statusDiv) statusDiv.insertAdjacentElement("afterend", walletBalancesDiv);
  if (walletBalancesDiv) walletBalancesDiv.insertAdjacentElement("afterend", productsDiv);
  if (productsDiv) productsDiv.insertAdjacentElement("afterend", bitcoinPriceDiv);

  // Fetch service status from /health endpoint
  fetch("/health")
    .then((response) => {
      if (!response.ok) throw new Error("Network response was not ok");
      return response.text();
    })
    .then((text) => {
      statusDiv.innerHTML = `Service Status: ${text}`;
    })
    .catch((error) => {
      console.error("Error fetching status:", error);
      statusDiv.innerHTML = "Error fetching status.";
    });

  // Fetch logs from /api/logs endpoint (assuming it exists)
  fetch("/api/logs")
    .then((response) => {
      if (!response.ok) throw new Error("Network response was not ok");
      return response.json();
    })
    .then((data) => {
      if (Array.isArray(data.logs)) {
        logsDiv.textContent = data.logs.join("\n");
      } else {
        logsDiv.textContent = "No logs available.";
      }
    })
    .catch((error) => {
      console.error("Error fetching logs:", error);
      logsDiv.textContent = "Error fetching logs.";
    });

  // Fetch USDT wallet balances from /dashboard endpoint
  fetch("/dashboard")
    .then((response) => response.json())
    .then((balances) => {
      if (balances.length === 0) {
        walletBalancesDiv.innerHTML = "<h3>USDT Wallet Balances</h3><p>No wallet balances available.</p>";
        return;
      }
      walletBalancesDiv.innerHTML = "<h3>USDT Wallet Balances</h3>";
      const ul = document.createElement("ul");
      balances.forEach(({ wallet, balance }) => {
        const li = document.createElement("li");
        li.textContent = `${wallet}: ${typeof balance === "number" ? balance.toLocaleString(undefined, {maximumFractionDigits: 8}) : balance}`;
        ul.appendChild(li);
      });
      walletBalancesDiv.appendChild(ul);
    })
    .catch((error) => {
      console.error("Error fetching wallet balances:", error);
      walletBalancesDiv.innerHTML = "<h3>USDT Wallet Balances</h3><p>Error fetching wallet balances.</p>";
    });

  // Fetch Shopify products from /shopify/products endpoint
  fetch("/shopify/products")
    .then((response) => response.json())
    .then((products) => {
      if (!Array.isArray(products) || products.length === 0) {
        productsDiv.innerHTML = "<h3>Shopify Products</h3><p>No products found.</p>";
        return;
      }
      productsDiv.innerHTML = "<h3>Shopify Products</h3>";
      const ul = document.createElement("ul");
      products.forEach((product) => {
        const li = document.createElement("li");
        const price = product?.variants?.[0]?.price ?? "N/A";
        li.textContent = `${product.title}: $${price}`;
        ul.appendChild(li);
      });
      productsDiv.appendChild(ul);
    })
    .catch((error) => {
      console.error("Error fetching Shopify products:", error);
      productsDiv.innerHTML = "<h3>Shopify Products</h3><p>Error fetching products.</p>";
    });

  // Fetch Bitcoin price from /bitcoin-price endpoint
  fetch("/bitcoin-price")
    .then((response) => response.json())
    .then((data) => {
      const price = data.price;
      bitcoinPriceDiv.innerHTML = `<h3>Bitcoin Price (USD)</h3><p>${price ? `$${price.toLocaleString()}` : "N/A"}</p>`;
    })
    .catch((error) => {
      console.error("Error fetching Bitcoin price:", error);
      bitcoinPriceDiv.innerHTML = "<h3>Bitcoin Price (USD)</h3><p>Error fetching price.</p>";
    });
});
