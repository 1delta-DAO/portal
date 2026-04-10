import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles/globals.css'
import '@rainbow-me/rainbowkit/styles.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import { RainbowKitProvider } from '@rainbow-me/rainbowkit'
import { BrowserRouter } from 'react-router-dom'
import { config } from './wagmi'
import App from './App'
import { ToastProvider } from './components/common/ToastHost'
import { SpyModeProvider } from './contexts/SpyMode'
import { rainbowDaisyTheme } from './rainbowkitTheme'

const client = new QueryClient()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={client}>
        <RainbowKitProvider theme={rainbowDaisyTheme}>
          <BrowserRouter>
            <SpyModeProvider>
              <ToastProvider>
                <App />
              </ToastProvider>
            </SpyModeProvider>
          </BrowserRouter>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>
)
