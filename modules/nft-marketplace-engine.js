// modules/nft-marketplace-engine.js
import { EventEmitter } from 'events';
import { ArielSQLiteEngine } from './ariel-sqlite-engine/index.js';
import { SovereignRevenueEngine } from './sovereign-revenue-engine.js';
import { ZeroKnowledgeProofEngine } from './zero-knowledge-proof-engine.js';
import { 
    BWAEZI_CHAIN,
    BWAEZI_SOVEREIGN_CONFIG,
    ConfigUtils 
} from '../config/bwaezi-config.js';
import { createHash, randomBytes, createCipheriv, createDecipheriv } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

export class NFTMarketplaceEngine {
    constructor(config = {}) {
        this.config = {
            marketplaceFee: 0.025,
            royaltyFee: 0.1,
            minListingPrice: 0.001,
            maxListingPrice: 1000000,
            supportedCurrencies: ['BWZ', 'ETH', 'USDT', 'USDC'],
            auctionDurations: [3600, 86400, 604800], // 1h, 24h, 7d
            maxAuctionBids: 1000,
            collectionVerification: true,
            ...config
        };
        this.nftCollections = new Map();
        this.nftTokens = new Map();
        this.listings = new Map();
        this.offers = new Map();
        this.auctions = new Map();
        this.db = new ArielSQLiteEngine({ path: './data/nft-marketplace.db' });
        this.events = new EventEmitter();
        this.sovereignService = null;
        this.serviceId = null;
        this.zkpEngine = null;
        this.initialized = false;
        this.assetPath = './data/nft-assets';
    }

    async initialize() {
        if (this.initialized) return;
        
        await this.db.init();
        await this.createDatabaseTables();
        await this.ensureAssetDirectory();
        
        this.sovereignService = new SovereignRevenueEngine();
        await this.sovereignService.initialize();
        
        this.zkpEngine = new ZeroKnowledgeProofEngine();
        await this.zkpEngine.initialize();
        
        this.serviceId = await this.sovereignService.registerService({
            name: 'NFTMarketplaceEngine',
            description: 'Advanced NFT marketplace with zero-knowledge verification and multi-chain support',
            registrationFee: 20000,
            annualLicenseFee: 10000,
            revenueShare: 0.25,
            serviceType: 'digital_assets',
            dataPolicy: 'Encrypted NFT metadata with on-chain verification - No plaintext IPFS content storage',
            compliance: ['Financial Compliance', 'AML', 'Zero-Knowledge Architecture']
        });

        await this.loadActiveCollections();
        await this.loadActiveListings();
        this.startMarketplaceMonitoring();
        this.initialized = true;
        
        this.events.emit('initialized', {
            timestamp: Date.now(),
            supportedCurrencies: this.config.supportedCurrencies,
            marketplaceFee: this.config.marketplaceFee,
            royaltyFee: this.config.royaltyFee
        });
    }

    async createDatabaseTables() {
        await this.db.run(`
            CREATE TABLE IF NOT EXISTS nft_collections (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                symbol TEXT NOT NULL,
                description TEXT,
                creator TEXT NOT NULL,
                contractAddress TEXT,
                metadata TEXT NOT NULL,
                royaltyPercentage REAL DEFAULT 0.1,
                isVerified BOOLEAN DEFAULT false,
                verificationProof TEXT,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                totalSupply INTEGER DEFAULT 0,
                totalVolume REAL DEFAULT 0,
                floorPrice REAL DEFAULT 0
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS nft_tokens (
                id TEXT PRIMARY KEY,
                collectionId TEXT NOT NULL,
                tokenId INTEGER NOT NULL,
                owner TEXT NOT NULL,
                creator TEXT NOT NULL,
                metadata BLOB NOT NULL,
                metadataHash TEXT NOT NULL,
                assetHash TEXT NOT NULL,
                properties TEXT,
                royaltyPercentage REAL DEFAULT 0.1,
                isListed BOOLEAN DEFAULT false,
                isBurned BOOLEAN DEFAULT false,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                lastTransferAt DATETIME,
                FOREIGN KEY (collectionId) REFERENCES nft_collections (id)
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS marketplace_listings (
                id TEXT PRIMARY KEY,
                tokenId TEXT NOT NULL,
                seller TEXT NOT NULL,
                price REAL NOT NULL,
                currency TEXT NOT NULL,
                listingType TEXT NOT NULL,
                duration INTEGER,
                startTime DATETIME DEFAULT CURRENT_TIMESTAMP,
                endTime DATETIME,
                status TEXT DEFAULT 'active',
                fees REAL DEFAULT 0,
                transactionHash TEXT,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (tokenId) REFERENCES nft_tokens (id)
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS marketplace_offers (
                id TEXT PRIMARY KEY,
                tokenId TEXT NOT NULL,
                buyer TEXT NOT NULL,
                price REAL NOT NULL,
                currency TEXT NOT NULL,
                expiration DATETIME NOT NULL,
                status TEXT DEFAULT 'pending',
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (tokenId) REFERENCES nft_tokens (id)
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS auction_listings (
                id TEXT PRIMARY KEY,
                tokenId TEXT NOT NULL,
                seller TEXT NOT NULL,
                reservePrice REAL NOT NULL,
                startingPrice REAL NOT NULL,
                currency TEXT NOT NULL,
                startTime DATETIME NOT NULL,
                endTime DATETIME NOT NULL,
                highestBid REAL DEFAULT 0,
                highestBidder TEXT,
                bidCount INTEGER DEFAULT 0,
                status TEXT DEFAULT 'active',
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (tokenId) REFERENCES nft_tokens (id)
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS auction_bids (
                id TEXT PRIMARY KEY,
                auctionId TEXT NOT NULL,
                bidder TEXT NOT NULL,
                amount REAL NOT NULL,
                currency TEXT NOT NULL,
                bidTime DATETIME DEFAULT CURRENT_TIMESTAMP,
                status TEXT DEFAULT 'active',
                transactionHash TEXT,
                FOREIGN KEY (auctionId) REFERENCES auction_listings (id)
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS nft_transfers (
                id TEXT PRIMARY KEY,
                tokenId TEXT NOT NULL,
                fromAddress TEXT NOT NULL,
                toAddress TEXT NOT NULL,
                price REAL,
                currency TEXT,
                transactionHash TEXT NOT NULL,
                transferType TEXT NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (tokenId) REFERENCES nft_tokens (id)
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS marketplace_analytics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                totalVolume REAL DEFAULT 0,
                totalTransactions INTEGER DEFAULT 0,
                activeListings INTEGER DEFAULT 0,
                activeAuctions INTEGER DEFAULT 0,
                floorPrice REAL DEFAULT 0,
                averageSalePrice REAL DEFAULT 0
            )
        `);
    }

    async ensureAssetDirectory() {
        if (!existsSync(this.assetPath)) {
            mkdirSync(this.assetPath, { recursive: true });
        }
    }

    async createCollection(name, symbol, creator, metadata, royaltyPercentage = 0.1, options = {}) {
        if (!this.initialized) await this.initialize();
        
        await this.validateCollectionCreation(name, symbol, creator, royaltyPercentage);

        const collectionId = this.generateCollectionId();
        const contractAddress = this.generateContractAddress();
        
        let verificationProof = null;
        if (this.config.collectionVerification) {
            verificationProof = await this.verifyCollection(metadata, creator);
        }

        await this.db.run(`
            INSERT INTO nft_collections (id, name, symbol, creator, metadata, royaltyPercentage, contractAddress, isVerified, verificationProof)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [collectionId, name, symbol, creator, JSON.stringify(metadata), royaltyPercentage, contractAddress, !!verificationProof, verificationProof]);

        const collection = {
            id: collectionId,
            name,
            symbol,
            creator,
            metadata,
            royaltyPercentage,
            contractAddress,
            isVerified: !!verificationProof,
            verificationProof,
            totalSupply: 0,
            totalVolume: 0,
            floorPrice: 0,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        this.nftCollections.set(collectionId, collection);

        this.events.emit('collectionCreated', {
            collectionId,
            name,
            symbol,
            creator,
            isVerified: !!verificationProof,
            timestamp: new Date()
        });

        return collectionId;
    }

    generateCollectionId() {
        const timestamp = Date.now().toString(36);
        const random = randomBytes(12).toString('hex');
        return `collection_${timestamp}_${random}`;
    }

    generateContractAddress() {
        return `0x${randomBytes(20).toString('hex')}`;
    }

    async validateCollectionCreation(name, symbol, creator, royaltyPercentage) {
        if (!name || name.length < 1 || name.length > 100) {
            throw new Error('Collection name must be between 1 and 100 characters');
        }

        if (!symbol || symbol.length < 1 || symbol.length > 10) {
            throw new Error('Collection symbol must be between 1 and 10 characters');
        }

        if (!creator || typeof creator !== 'string') {
            throw new Error('Valid creator address required');
        }

        if (royaltyPercentage < 0 || royaltyPercentage > 0.5) {
            throw new Error('Royalty percentage must be between 0 and 0.5 (50%)');
        }

        const existingCollection = await this.db.get(
            'SELECT COUNT(*) as count FROM nft_collections WHERE name = ? OR symbol = ?',
            [name, symbol]
        );
        if (existingCollection.count > 0) {
            throw new Error('Collection name or symbol already exists');
        }
    }

    async verifyCollection(metadata, creator) {
        const verificationData = {
            metadataHash: this.hashMetadata(metadata),
            creator,
            timestamp: Date.now(),
            verificationMethod: 'automated_checks'
        };

        return createHash('sha256')
            .update(JSON.stringify(verificationData))
            .digest('hex');
    }

    async mintNFT(collectionId, owner, metadata, properties = {}, royaltyPercentage = null, options = {}) {
        if (!this.initialized) await this.initialize();
        
        const collection = await this.getCollection(collectionId);
        if (!collection) {
            throw new Error(`Collection not found: ${collectionId}`);
        }

        await this.validateMinting(collection, owner, metadata);

        const tokenId = this.generateTokenId();
        const tokenIdentifier = await this.generateTokenIdentifier(collectionId, collection.totalSupply + 1);
        
        const encryptedMetadata = await this.encryptNFTMetadata(metadata);
        const metadataHash = this.hashMetadata(metadata);
        const assetHash = await this.processNFTAsset(metadata, options.assetData);

        const finalRoyaltyPercentage = royaltyPercentage !== null ? royaltyPercentage : collection.royaltyPercentage;

        await this.db.run(`
            INSERT INTO nft_tokens (id, collectionId, tokenId, owner, creator, metadata, metadataHash, assetHash, properties, royaltyPercentage)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [tokenId, collectionId, tokenIdentifier, owner, collection.creator, encryptedMetadata, metadataHash, assetHash, JSON.stringify(properties), finalRoyaltyPercentage]);

        await this.db.run(`
            UPDATE nft_collections 
            SET totalSupply = totalSupply + 1, updatedAt = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [collectionId]);

        const token = {
            id: tokenId,
            collectionId,
            tokenId: tokenIdentifier,
            owner,
            creator: collection.creator,
            metadata,
            metadataHash,
            assetHash,
            properties,
            royaltyPercentage: finalRoyaltyPercentage,
            isListed: false,
            isBurned: false,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        this.nftTokens.set(tokenId, token);
        collection.totalSupply += 1;

        await this.recordTransfer(tokenId, '0x0', owner, 0, null, 'mint');

        this.events.emit('nftMinted', {
            tokenId,
            collectionId,
            owner,
            tokenIdentifier,
            royaltyPercentage: finalRoyaltyPercentage,
            timestamp: new Date()
        });

        return tokenId;
    }

    generateTokenId() {
        const timestamp = Date.now().toString(36);
        const random = randomBytes(16).toString('hex');
        return `nft_${timestamp}_${random}`;
    }

    async generateTokenIdentifier(collectionId, tokenNumber) {
        const collection = await this.getCollection(collectionId);
        return `${collection.symbol}-${tokenNumber.toString().padStart(6, '0')}`;
    }

    async validateMinting(collection, owner, metadata) {
        if (!owner || typeof owner !== 'string') {
            throw new Error('Valid owner address required');
        }

        if (!metadata || typeof metadata !== 'object') {
            throw new Error('Valid metadata object required');
        }

        if (collection.totalSupply >= 1000000) {
            throw new Error('Collection supply limit reached');
        }

        const metadataSize = Buffer.from(JSON.stringify(metadata)).length;
        if (metadataSize > 1024 * 1024) {
            throw new Error('Metadata exceeds maximum size of 1MB');
        }
    }

    async encryptNFTMetadata(metadata) {
        const metadataString = JSON.stringify(metadata);
        const key = randomBytes(32);
        const iv = randomBytes(16);
        
        const cipher = createCipheriv('aes-256-gcm', key, iv);
        const encrypted = Buffer.concat([
            cipher.update(metadataString, 'utf8'),
            cipher.final()
        ]);

        const authTag = cipher.getAuthTag();
        
        const encryptedData = Buffer.concat([iv, authTag, encrypted]);
        await this.storeEncryptionKey(encryptedData, key);
        
        return encryptedData;
    }

    async storeEncryptionKey(encryptedData, key) {
        const keyId = createHash('sha256').update(encryptedData).digest('hex');
        const keyPath = join(this.assetPath, `${keyId}.key`);
        writeFileSync(keyPath, key);
        return keyId;
    }

    async decryptNFTMetadata(encryptedData) {
        try {
            const keyId = createHash('sha256').update(encryptedData).digest('hex');
            const keyPath = join(this.assetPath, `${keyId}.key`);
            
            if (!existsSync(keyPath)) {
                throw new Error('Encryption key not found');
            }

            const key = readFileSync(keyPath);
            const iv = encryptedData.slice(0, 16);
            const authTag = encryptedData.slice(16, 32);
            const encrypted = encryptedData.slice(32);
            
            const decipher = createDecipheriv('aes-256-gcm', key, iv);
            decipher.setAuthTag(authTag);
            
            const decrypted = Buffer.concat([
                decipher.update(encrypted),
                decipher.final()
            ]);

            return JSON.parse(decrypted.toString('utf8'));
        } catch (error) {
            throw new Error(`Failed to decrypt NFT metadata: ${error.message}`);
        }
    }

    hashMetadata(metadata) {
        return createHash('sha256')
            .update(JSON.stringify(metadata))
            .digest('hex');
    }

    async processNFTAsset(metadata, assetData) {
        if (assetData) {
            const assetHash = createHash('sha256').update(assetData).digest('hex');
            const assetPath = join(this.assetPath, `${assetHash}.asset`);
            writeFileSync(assetPath, assetData);
            return assetHash;
        }

        if (metadata.image || metadata.animation_url) {
            const assetUrl = metadata.image || metadata.animation_url;
            return createHash('sha256').update(assetUrl).digest('hex');
        }

        return createHash('sha256').update(JSON.stringify(metadata)).digest('hex');
    }

    async listNFT(tokenId, seller, price, currency = 'BWZ', listingType = 'fixed_price', duration = null, options = {}) {
        if (!this.initialized) await this.initialize();
        
        const token = await this.getNFT(tokenId);
        if (!token) {
            throw new Error(`NFT not found: ${tokenId}`);
        }

        if (token.owner !== seller) {
            throw new Error('Only token owner can list for sale');
        }

        if (token.isListed) {
            throw new Error('NFT is already listed');
        }

        await this.validateListing(price, currency, listingType, duration);

        const listingId = this.generateListingId();
        const fees = this.calculateListingFees(price);
        const endTime = duration ? new Date(Date.now() + duration * 1000) : null;

        await this.db.run(`
            INSERT INTO marketplace_listings (id, tokenId, seller, price, currency, listingType, duration, endTime, fees)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [listingId, tokenId, seller, price, currency, listingType, duration, endTime, fees]);

        await this.db.run(`
            UPDATE nft_tokens 
            SET isListed = true, updatedAt = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [tokenId]);

        const listing = {
            id: listingId,
            tokenId,
            seller,
            price,
            currency,
            listingType,
            duration,
            startTime: new Date(),
            endTime,
            fees,
            status: 'active'
        };

        this.listings.set(listingId, listing);
        token.isListed = true;

        this.events.emit('nftListed', {
            listingId,
            tokenId,
            seller,
            price,
            currency,
            listingType,
            fees,
            timestamp: new Date()
        });

        return listingId;
    }

    async validateListing(price, currency, listingType, duration) {
        if (price < this.config.minListingPrice) {
            throw new Error(`Price below minimum: ${price} < ${this.config.minListingPrice}`);
        }

        if (price > this.config.maxListingPrice) {
            throw new Error(`Price above maximum: ${price} > ${this.config.maxListingPrice}`);
        }

        if (!this.config.supportedCurrencies.includes(currency)) {
            throw new Error(`Unsupported currency: ${currency}`);
        }

        const validListingTypes = ['fixed_price', 'auction', 'offer'];
        if (!validListingTypes.includes(listingType)) {
            throw new Error(`Invalid listing type: ${listingType}`);
        }

        if (listingType === 'auction' && !duration) {
            throw new Error('Auction listings require duration');
        }

        if (duration && !this.config.auctionDurations.includes(duration)) {
            throw new Error(`Invalid auction duration. Supported: ${this.config.auctionDurations.join(', ')}`);
        }
    }

    calculateListingFees(price) {
        return price * this.config.marketplaceFee;
    }

    generateListingId() {
        const timestamp = Date.now().toString(36);
        const random = randomBytes(12).toString('hex');
        return `listing_${timestamp}_${random}`;
    }

    async purchaseNFT(listingId, buyer, price, options = {}) {
        if (!this.initialized) await this.initialize();
        
        const listing = await this.getListing(listingId);
        if (!listing) {
            throw new Error(`Listing not found: ${listingId}`);
        }

        if (listing.status !== 'active') {
            throw new Error('Listing is not active');
        }

        if (listing.endTime && new Date(listing.endTime) < new Date()) {
            throw new Error('Listing has expired');
        }

        const token = await this.getNFT(listing.tokenId);
        if (!token) {
            throw new Error('Associated NFT not found');
        }

        if (price < listing.price) {
            throw new Error(`Offer price ${price} is below listing price ${listing.price}`);
        }

        await this.executePurchase(listing, token, buyer, price, options);

        const finalPrice = price || listing.price;
        await this.recordSale(listing, token, buyer, finalPrice);

        this.events.emit('nftPurchased', {
            listingId,
            tokenId: token.id,
            seller: listing.seller,
            buyer,
            price: finalPrice,
            currency: listing.currency,
            timestamp: new Date()
        });

        return this.generateTransactionHash();
    }

    async executePurchase(listing, token, buyer, price, options) {
        const finalPrice = price || listing.price;
        const marketplaceFee = finalPrice * this.config.marketplaceFee;
        const royaltyFee = finalPrice * token.royaltyPercentage;
        const sellerProceeds = finalPrice - marketplaceFee - royaltyFee;

        await this.processPayment(buyer, listing.seller, token.creator, finalPrice, marketplaceFee, royaltyFee, sellerProceeds);

        await this.db.run(`
            UPDATE marketplace_listings 
            SET status = 'sold', updatedAt = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [listing.id]);

        await this.db.run(`
            UPDATE nft_tokens 
            SET owner = ?, isListed = false, updatedAt = CURRENT_TIMESTAMP, lastTransferAt = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [buyer, token.id]);

        await this.recordTransfer(token.id, listing.seller, buyer, finalPrice, listing.currency, 'sale');

        token.owner = buyer;
        token.isListed = false;
        listing.status = 'sold';

        if (this.sovereignService && this.serviceId) {
            await this.sovereignService.processRevenue(
                this.serviceId,
                marketplaceFee,
                'nft_sale',
                'USD',
                'bwaezi',
                {
                    tokenId: token.id,
                    salePrice: finalPrice,
                    seller: listing.seller,
                    buyer
                }
            );
        }
    }

    async processPayment(buyer, seller, creator, totalAmount, marketplaceFee, royaltyFee, sellerProceeds) {
        return {
            success: true,
            buyerDeducted: totalAmount,
            sellerReceived: sellerProceeds,
            creatorReceived: royaltyFee,
            marketplaceFee,
            transactionHash: this.generateTransactionHash()
        };
    }

    async recordSale(listing, token, buyer, price) {
        const collection = await this.getCollection(token.collectionId);
        if (collection) {
            await this.db.run(`
                UPDATE nft_collections 
                SET totalVolume = totalVolume + ?, updatedAt = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [price, token.collectionId]);
            collection.totalVolume += price;
        }
    }

    async recordTransfer(tokenId, from, to, price, currency, transferType) {
        const transferId = this.generateTransferId();
        
        await this.db.run(`
            INSERT INTO nft_transfers (id, tokenId, fromAddress, toAddress, price, currency, transactionHash, transferType)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [transferId, tokenId, from, to, price, currency, this.generateTransactionHash(), transferType]);
    }

    generateTransferId() {
        const timestamp = Date.now().toString(36);
        const random = randomBytes(8).toString('hex');
        return `transfer_${timestamp}_${random}`;
    }

    generateTransactionHash() {
        return `0x${randomBytes(32).toString('hex')}`;
    }

    async createAuction(tokenId, seller, reservePrice, startingPrice, currency, duration, options = {}) {
        if (!this.initialized) await this.initialize();
        
        const token = await this.getNFT(tokenId);
        if (!token) {
            throw new Error(`NFT not found: ${tokenId}`);
        }

        if (token.owner !== seller) {
            throw new Error('Only token owner can create auction');
        }

        if (token.isListed) {
            throw new Error('NFT is already listed');
        }

        await this.validateAuction(reservePrice, startingPrice, currency, duration);

        const auctionId = this.generateAuctionId();
        const startTime = new Date();
        const endTime = new Date(Date.now() + duration * 1000);

        await this.db.run(`
            INSERT INTO auction_listings (id, tokenId, seller, reservePrice, startingPrice, currency, startTime, endTime)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [auctionId, tokenId, seller, reservePrice, startingPrice, currency, startTime, endTime]);

        await this.db.run(`
            UPDATE nft_tokens 
            SET isListed = true, updatedAt = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [tokenId]);

        const auction = {
            id: auctionId,
            tokenId,
            seller,
            reservePrice,
            startingPrice,
            currency,
            startTime,
            endTime,
            highestBid: startingPrice,
            highestBidder: null,
            bidCount: 0,
            status: 'active'
        };

        this.auctions.set(auctionId, auction);
        token.isListed = true;

        this.events.emit('auctionCreated', {
            auctionId,
            tokenId,
            seller,
            reservePrice,
            startingPrice,
            currency,
            duration,
            endTime,
            timestamp: new Date()
        });

        return auctionId;
    }

    async validateAuction(reservePrice, startingPrice, currency, duration) {
        if (reservePrice < this.config.minListingPrice) {
            throw new Error(`Reserve price below minimum: ${reservePrice} < ${this.config.minListingPrice}`);
        }

        if (startingPrice > reservePrice) {
            throw new Error('Starting price cannot exceed reserve price');
        }

        if (!this.config.supportedCurrencies.includes(currency)) {
            throw new Error(`Unsupported currency: ${currency}`);
        }

        if (!this.config.auctionDurations.includes(duration)) {
            throw new Error(`Invalid auction duration. Supported: ${this.config.auctionDurations.join(', ')}`);
        }
    }

    generateAuctionId() {
        const timestamp = Date.now().toString(36);
        const random = randomBytes(12).toString('hex');
        return `auction_${timestamp}_${random}`;
    }

    async placeBid(auctionId, bidder, amount, options = {}) {
        if (!this.initialized) await this.initialize();
        
        const auction = await this.getAuction(auctionId);
        if (!auction) {
            throw new Error(`Auction not found: ${auctionId}`);
        }

        if (auction.status !== 'active') {
            throw new Error('Auction is not active');
        }

        if (new Date() < auction.startTime) {
            throw new Error('Auction has not started');
        }

        if (new Date() > auction.endTime) {
            throw new Error('Auction has ended');
        }

        if (amount <= auction.highestBid) {
            throw new Error(`Bid amount must be higher than current highest bid: ${auction.highestBid}`);
        }

        if (auction.bidCount >= this.config.maxAuctionBids) {
            throw new Error('Maximum bid count reached for this auction');
        }

        const bidId = this.generateBidId();

        await this.db.run(`
            INSERT INTO auction_bids (id, auctionId, bidder, amount, currency)
            VALUES (?, ?, ?, ?, ?)
        `, [bidId, auctionId, bidder, amount, auction.currency]);

        await this.db.run(`
            UPDATE auction_listings 
            SET highestBid = ?, highestBidder = ?, bidCount = bidCount + 1, updatedAt = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [amount, bidder, auctionId]);

        auction.highestBid = amount;
        auction.highestBidder = bidder;
        auction.bidCount += 1;

        this.events.emit('bidPlaced', {
            bidId,
            auctionId,
            bidder,
            amount,
            currency: auction.currency,
            timestamp: new Date()
        });

        if (amount >= auction.reservePrice) {
            await this.finalizeAuction(auctionId);
        }

        return bidId;
    }

    generateBidId() {
        const timestamp = Date.now().toString(36);
        const random = randomBytes(8).toString('hex');
        return `bid_${timestamp}_${random}`;
    }

    async finalizeAuction(auctionId) {
        const auction = await this.getAuction(auctionId);
        if (!auction || auction.status !== 'active') {
            return;
        }

        if (new Date() < auction.endTime && auction.highestBid < auction.reservePrice) {
            return;
        }

        if (auction.highestBidder && auction.highestBid >= auction.reservePrice) {
            await this.executeAuctionPurchase(auction);
        } else {
            await this.cancelAuction(auction);
        }
    }

    async executeAuctionPurchase(auction) {
        const token = await this.getNFT(auction.tokenId);
        if (!token) {
            throw new Error('Associated NFT not found');
        }

        const marketplaceFee = auction.highestBid * this.config.marketplaceFee;
        const royaltyFee = auction.highestBid * token.royaltyPercentage;
        const sellerProceeds = auction.highestBid - marketplaceFee - royaltyFee;

        await this.processPayment(auction.highestBidder, auction.seller, token.creator, auction.highestBid, marketplaceFee, royaltyFee, sellerProceeds);

        await this.db.run(`
            UPDATE auction_listings 
            SET status = 'sold', updatedAt = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [auction.id]);

        await this.db.run(`
            UPDATE nft_tokens 
            SET owner = ?, isListed = false, updatedAt = CURRENT_TIMESTAMP, lastTransferAt = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [auction.highestBidder, token.id]);

        await this.recordTransfer(token.id, auction.seller, auction.highestBidder, auction.highestBid, auction.currency, 'auction_sale');

        token.owner = auction.highestBidder;
        token.isListed = false;
        auction.status = 'sold';

        if (this.sovereignService && this.serviceId) {
            await this.sovereignService.processRevenue(
                this.serviceId,
                marketplaceFee,
                'auction_sale',
                'USD',
                'bwaezi',
                {
                    tokenId: token.id,
                    salePrice: auction.highestBid,
                    seller: auction.seller,
                    buyer: auction.highestBidder
                }
            );
        }

        this.events.emit('auctionFinalized', {
            auctionId: auction.id,
            tokenId: token.id,
            seller: auction.seller,
            buyer: auction.highestBidder,
            finalPrice: auction.highestBid,
            currency: auction.currency,
            timestamp: new Date()
        });
    }

    async cancelAuction(auction) {
        await this.db.run(`
            UPDATE auction_listings 
            SET status = 'cancelled', updatedAt = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [auction.id]);

        await this.db.run(`
            UPDATE nft_tokens 
            SET isListed = false, updatedAt = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [auction.tokenId]);

        const token = await this.getNFT(auction.tokenId);
        if (token) {
            token.isListed = false;
        }

        auction.status = 'cancelled';

        this.events.emit('auctionCancelled', {
            auctionId: auction.id,
            tokenId: auction.tokenId,
            reason: 'Reserve price not met',
            timestamp: new Date()
        });
    }

    async getCollection(collectionId) {
        if (this.nftCollections.has(collectionId)) {
            return this.nftCollections.get(collectionId);
        }

        const collectionRecord = await this.db.get('SELECT * FROM nft_collections WHERE id = ?', [collectionId]);
        if (!collectionRecord) {
            return null;
        }

        const collection = {
            id: collectionRecord.id,
            name: collectionRecord.name,
            symbol: collectionRecord.symbol,
            creator: collectionRecord.creator,
            metadata: JSON.parse(collectionRecord.metadata),
            royaltyPercentage: collectionRecord.royaltyPercentage,
            contractAddress: collectionRecord.contractAddress,
            isVerified: !!collectionRecord.isVerified,
            verificationProof: collectionRecord.verificationProof,
            totalSupply: collectionRecord.totalSupply,
            totalVolume: collectionRecord.totalVolume,
            floorPrice: collectionRecord.floorPrice,
            createdAt: new Date(collectionRecord.createdAt),
            updatedAt: new Date(collectionRecord.updatedAt)
        };

        this.nftCollections.set(collectionId, collection);
        return collection;
    }

    async getNFT(tokenId) {
        if (this.nftTokens.has(tokenId)) {
            return this.nftTokens.get(tokenId);
        }

        const tokenRecord = await this.db.get('SELECT * FROM nft_tokens WHERE id = ?', [tokenId]);
        if (!tokenRecord) {
            return null;
        }

        const metadata = await this.decryptNFTMetadata(tokenRecord.metadata);

        const token = {
            id: tokenRecord.id,
            collectionId: tokenRecord.collectionId,
            tokenId: tokenRecord.tokenId,
            owner: tokenRecord.owner,
            creator: tokenRecord.creator,
            metadata,
            metadataHash: tokenRecord.metadataHash,
            assetHash: tokenRecord.assetHash,
            properties: JSON.parse(tokenRecord.properties || '{}'),
            royaltyPercentage: tokenRecord.royaltyPercentage,
            isListed: !!tokenRecord.isListed,
            isBurned: !!tokenRecord.isBurned,
            createdAt: new Date(tokenRecord.createdAt),
            updatedAt: new Date(tokenRecord.updatedAt),
            lastTransferAt: tokenRecord.lastTransferAt ? new Date(tokenRecord.lastTransferAt) : null
        };

        this.nftTokens.set(tokenId, token);
        return token;
    }

    async getListing(listingId) {
        if (this.listings.has(listingId)) {
            return this.listings.get(listingId);
        }

        const listingRecord = await this.db.get('SELECT * FROM marketplace_listings WHERE id = ?', [listingId]);
        if (!listingRecord) {
            return null;
        }

        const listing = {
            id: listingRecord.id,
            tokenId: listingRecord.tokenId,
            seller: listingRecord.seller,
            price: listingRecord.price,
            currency: listingRecord.currency,
            listingType: listingRecord.listingType,
            duration: listingRecord.duration,
            startTime: new Date(listingRecord.startTime),
            endTime: listingRecord.endTime ? new Date(listingRecord.endTime) : null,
            fees: listingRecord.fees,
            status: listingRecord.status
        };

        this.listings.set(listingId, listing);
        return listing;
    }

    async getAuction(auctionId) {
        if (this.auctions.has(auctionId)) {
            return this.auctions.get(auctionId);
        }

        const auctionRecord = await this.db.get('SELECT * FROM auction_listings WHERE id = ?', [auctionId]);
        if (!auctionRecord) {
            return null;
        }

        const auction = {
            id: auctionRecord.id,
            tokenId: auctionRecord.tokenId,
            seller: auctionRecord.seller,
            reservePrice: auctionRecord.reservePrice,
            startingPrice: auctionRecord.startingPrice,
            currency: auctionRecord.currency,
            startTime: new Date(auctionRecord.startTime),
            endTime: new Date(auctionRecord.endTime),
            highestBid: auctionRecord.highestBid,
            highestBidder: auctionRecord.highestBidder,
            bidCount: auctionRecord.bidCount,
            status: auctionRecord.status
        };

        this.auctions.set(auctionId, auction);
        return auction;
    }

    async loadActiveCollections() {
        const activeCollections = await this.db.all(`
            SELECT id FROM nft_collections
        `);

        for (const collection of activeCollections) {
            await this.getCollection(collection.id);
        }

        console.log(`✅ Loaded ${activeCollections.length} NFT collections`);
    }

    async loadActiveListings() {
        const activeListings = await this.db.all(`
            SELECT id FROM marketplace_listings WHERE status = 'active'
        `);

        for (const listing of activeListings) {
            await this.getListing(listing.id);
        }

        console.log(`✅ Loaded ${activeListings.length} active listings`);
    }

    startMarketplaceMonitoring() {
        setInterval(async () => {
            try {
                await this.processExpiredListings();
                await this.finalizeEndedAuctions();
                await this.updateMarketplaceAnalytics();
            } catch (error) {
                console.error('❌ Marketplace monitoring failed:', error);
            }
        }, 30000);
    }

    async processExpiredListings() {
        const expiredListings = await this.db.all(`
            SELECT id FROM marketplace_listings 
            WHERE status = 'active' AND endTime IS NOT NULL AND endTime < CURRENT_TIMESTAMP
        `);

        for (const listing of expiredListings) {
            await this.db.run(`
                UPDATE marketplace_listings 
                SET status = 'expired', updatedAt = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [listing.id]);

            const listingObj = await this.getListing(listing.id);
            if (listingObj) {
                listingObj.status = 'expired';
            }

            const token = await this.getNFT(listingObj.tokenId);
            if (token) {
                await this.db.run(`
                    UPDATE nft_tokens 
                    SET isListed = false, updatedAt = CURRENT_TIMESTAMP
                    WHERE id = ?
                `, [token.id]);
                token.isListed = false;
            }

            this.events.emit('listingExpired', {
                listingId: listing.id,
                tokenId: listingObj.tokenId,
                timestamp: new Date()
            });
        }
    }

    async finalizeEndedAuctions() {
        const endedAuctions = await this.db.all(`
            SELECT id FROM auction_listings 
            WHERE status = 'active' AND endTime < CURRENT_TIMESTAMP
        `);

        for (const auction of endedAuctions) {
            await this.finalizeAuction(auction.id);
        }
    }

    async updateMarketplaceAnalytics() {
        const totalVolume = await this.db.get(`
            SELECT COALESCE(SUM(price), 0) as volume
            FROM nft_transfers 
            WHERE transferType IN ('sale', 'auction_sale') 
            AND timestamp > datetime('now', '-24 hours')
        `);

        const totalTransactions = await this.db.get(`
            SELECT COUNT(*) as count
            FROM nft_transfers 
            WHERE timestamp > datetime('now', '-24 hours')
        `);

        const activeListings = await this.db.get(`
            SELECT COUNT(*) as count
            FROM marketplace_listings 
            WHERE status = 'active'
        `);

        const activeAuctions = await this.db.get(`
            SELECT COUNT(*) as count
            FROM auction_listings 
            WHERE status = 'active'
        `);

        const floorPrice = await this.db.get(`
            SELECT MIN(price) as floor
            FROM marketplace_listings 
            WHERE status = 'active' AND currency = 'BWZ'
        `);

        const averageSalePrice = await this.db.get(`
            SELECT AVG(price) as average
            FROM nft_transfers 
            WHERE transferType IN ('sale', 'auction_sale') 
            AND timestamp > datetime('now', '-24 hours')
        `);

        await this.db.run(`
            INSERT INTO marketplace_analytics (totalVolume, totalTransactions, activeListings, activeAuctions, floorPrice, averageSalePrice)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [totalVolume.volume, totalTransactions.count, activeListings.count, activeAuctions.count, floorPrice.floor, averageSalePrice.average]);

        this.events.emit('analyticsUpdated', {
            totalVolume: totalVolume.volume,
            totalTransactions: totalTransactions.count,
            activeListings: activeListings.count,
            activeAuctions: activeAuctions.count,
            floorPrice: floorPrice.floor,
            averageSalePrice: averageSalePrice.average,
            timestamp: new Date()
        });
    }

    async getMarketplaceStats(timeframe = '24h') {
        if (!this.initialized) await this.initialize();
        
        const timeFilter = this.getTimeFilter(timeframe);
        
        const volumeStats = await this.db.get(`
            SELECT 
                SUM(price) as totalVolume,
                COUNT(*) as totalSales,
                AVG(price) as averagePrice
            FROM nft_transfers 
            WHERE transferType IN ('sale', 'auction_sale') AND timestamp >= ?
        `, [timeFilter]);

        const collectionStats = await this.db.all(`
            SELECT 
                c.id,
                c.name,
                c.symbol,
                COUNT(t.id) as tokensListed,
                SUM(CASE WHEN t.isListed = 1 THEN 1 ELSE 0 END) as activeListings,
                COALESCE(SUM(nt.price), 0) as volume
            FROM nft_collections c
            LEFT JOIN nft_tokens t ON c.id = t.collectionId
            LEFT JOIN nft_transfers nt ON t.id = nt.tokenId AND nt.timestamp >= ?
            GROUP BY c.id
            ORDER BY volume DESC
            LIMIT 10
        `, [timeFilter]);

        const userStats = await this.db.all(`
            SELECT 
                buyer as address,
                COUNT(*) as purchases,
                SUM(price) as totalSpent
            FROM nft_transfers 
            WHERE transferType IN ('sale', 'auction_sale') AND timestamp >= ?
            GROUP BY buyer
            ORDER BY totalSpent DESC
            LIMIT 10
        `, [timeFilter]);

        return {
            timeframe,
            volume: volumeStats,
            topCollections: collectionStats,
            topBuyers: userStats,
            timestamp: new Date()
        };
    }

    getTimeFilter(timeframe) {
        const now = Date.now();
        const periods = {
            '24h': 24 * 60 * 60 * 1000,
            '7d': 7 * 24 * 60 * 60 * 1000,
            '30d': 30 * 24 * 60 * 60 * 1000
        };
        return new Date(now - (periods[timeframe] || periods['24h']));
    }

    async generateZKProofForOwnership(tokenId, owner, statement) {
        if (!this.initialized) await this.initialize();
        
        const token = await this.getNFT(tokenId);
        if (!token) {
            throw new Error(`NFT not found: ${tokenId}`);
        }

        if (token.owner !== owner) {
            throw new Error('Address does not own this NFT');
        }

        const witness = {
            tokenId: token.id,
            owner: token.owner,
            collectionId: token.collectionId,
            metadataHash: token.metadataHash,
            ownershipTimestamp: Date.now()
        };

        const proofId = await this.zkpEngine.generateProof('membership', statement, witness);

        this.events.emit('ownershipProofGenerated', {
            tokenId,
            owner,
            proofId,
            timestamp: new Date()
        });

        return proofId;
    }
}

export default NFTMarketplaceEngine;
