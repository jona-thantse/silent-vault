import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployedFHECounter = await deploy("FHECounter", {
    from: deployer,
    log: true,
  });
  console.log(`FHECounter contract: `, deployedFHECounter.address);

  const deployedCUSDT = await deploy("ConfidentialUSDT", {
    from: deployer,
    log: true,
  });
  console.log(`ConfidentialUSDT contract: `, deployedCUSDT.address);

  const deployedSilentVault = await deploy("SilentVault", {
    from: deployer,
    args: [deployedCUSDT.address],
    log: true,
  });
  console.log(`SilentVault contract: `, deployedSilentVault.address);
};
export default func;
func.id = "deploy_silent_vault"; // id required to prevent reexecution
func.tags = ["FHECounter", "ConfidentialUSDT", "SilentVault"];
