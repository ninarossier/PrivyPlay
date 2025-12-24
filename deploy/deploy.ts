import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployedPrivyPlay = await deploy("PrivyPlay", {
    from: deployer,
    log: true,
  });

  console.log(`PrivyPlay contract: `, deployedPrivyPlay.address);
};
export default func;
func.id = "deploy_privyplay"; // id required to prevent reexecution
func.tags = ["PrivyPlay"];
