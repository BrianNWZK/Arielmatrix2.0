// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract BwaeziCore {
    address public owner;
    address public treasury;
    uint256 public protocolFeePercent = 5; // 5% fee

    constructor(address _treasury) {
        owner = msg.sender;
        treasury = _treasury;
    }

    struct Service {
        string name;
        string endpoint;
        uint256 pricePerCall;
        address owner;
        bool active;
        uint256 registeredAt;
    }

    mapping(string => Service) public services;
    string[] public serviceNames;

    event ServiceRegistered(string name, string endpoint, uint256 price, address owner);
    event ServiceUpdated(string name, string endpoint, uint256 price, bool active);
    event ServiceDeactivated(string name);
    event ServiceCalled(string name, address caller, uint256 amount, uint256 timestamp);

    modifier onlyOwner(string memory name) {
        require(services[name].owner == msg.sender, "Unauthorized");
        _;
    }

    function registerService(
        string memory name,
        string memory endpoint,
        uint256 pricePerCall
    ) public {
        require(bytes(name).length > 0, "Name required");
        require(bytes(endpoint).length > 0, "Endpoint required");
        require(services[name].owner == address(0), "Already registered");

        services[name] = Service({
            name: name,
            endpoint: endpoint,
            pricePerCall: pricePerCall,
            owner: msg.sender,
            active: true,
            registeredAt: block.timestamp
        });

        serviceNames.push(name);
        emit ServiceRegistered(name, endpoint, pricePerCall, msg.sender);
    }

    function updateService(
        string memory name,
        string memory newEndpoint,
        uint256 newPrice,
        bool active
    ) public onlyOwner(name) {
        Service storage svc = services[name];
        svc.endpoint = newEndpoint;
        svc.pricePerCall = newPrice;
        svc.active = active;

        emit ServiceUpdated(name, newEndpoint, newPrice, active);
    }

    function deactivateService(string memory name) public onlyOwner(name) {
        services[name].active = false;
        emit ServiceDeactivated(name);
    }

    function getAllServices() public view returns (Service[] memory) {
        Service[] memory result = new Service[](serviceNames.length);
        for (uint i = 0; i < serviceNames.length; i++) {
            result[i] = services[serviceNames[i]];
        }
        return result;
    }

    function getService(string memory name) public view returns (Service memory) {
        return services[name];
    }

    function callService(string memory name) public payable {
        Service memory svc = services[name];
        require(svc.active, "Service inactive");
        require(msg.value >= svc.pricePerCall, "Insufficient payment");

        uint256 fee = (msg.value * protocolFeePercent) / 100;
        uint256 payout = msg.value - fee;

        address recipient = svc.owner != address(0) ? svc.owner : treasury;

        payable(recipient).transfer(payout);
        payable(treasury).transfer(fee);

        emit ServiceCalled(name, msg.sender, msg.value, block.timestamp);
    }

    function updateProtocolFee(uint256 newFeePercent) public {
        require(msg.sender == owner, "Only contract owner");
        require(newFeePercent <= 20, "Fee too high");
        protocolFeePercent = newFeePercent;
    }

    function updateTreasury(address newTreasury) public {
        require(msg.sender == owner, "Only contract owner");
        treasury = newTreasury;
    }
}
