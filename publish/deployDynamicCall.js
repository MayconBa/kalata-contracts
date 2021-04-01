async function testDeployDynamicCall(hre) {
    const {deploy} = hre.deployments;
    const {deployer} = await hre.getNamedAccounts()

    const receiver = await deploy('Receiver', {from: deployer, gasLimit: 4000000, args: []});
    const caller = await deploy('Caller', {from: deployer, gasLimit: 4000000, args: []});

    const accounts = await hre.ethers.getSigners();
    const signer = accounts[0];

    //Create connection to API Consumer Contract and call the createRequestTo function
    const callerInstance = new hre.ethers.Contract(caller.address, caller.abi, signer);

    console.log("receiver address:", receiver.address)
    console.log("caller address:", caller.address)
    //await caller.testCallFoo(receiver.address);

    const data = await callerInstance.testCallFoo(receiver.address);
    console.log(data)
}