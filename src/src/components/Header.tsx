import { ConnectButton } from '@rainbow-me/rainbowkit';
import '../styles/Header.css';

export function Header() {
  return (
    <header className="header">
      <div className="header-container">
        <div className="header-content">
          <div className="header-left">
            <div>
              <h1 className="header-title">Silent Vault</h1>
              <p className="header-subtitle">Private cUSDT staking and borrowing</p>
            </div>
          </div>
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
