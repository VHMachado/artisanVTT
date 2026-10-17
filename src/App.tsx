import { Switch, Route, BrowserRouter as Router } from "react-router-dom";
import { ThemeProvider } from "theme-ui";

import AuthGate from "./components/AuthGate";
import { ToastProvider } from "./components/Toast";

import { AccountProvider } from "./contexts/AccountContext";
import { DatabaseProvider } from "./contexts/DatabaseContext";
import { KeyboardProvider } from "./contexts/KeyboardContext";
import { SettingsProvider } from "./contexts/SettingsContext";
import { UserIdProvider } from "./contexts/UserIdContext";

import useFullscreenShortcut from "./hooks/useFullscreenShortcut";

import Game from "./routes/Game";
import Home from "./routes/Home";
import theme from "./theme";

type ChildrenProp = { children: React.ReactNode };

function GlobalProviders({ children }: ChildrenProp) {
  return (
    <ThemeProvider theme={theme}>
      <SettingsProvider>
        <AccountProvider>
          <KeyboardProvider>
            <ToastProvider>{children}</ToastProvider>
          </KeyboardProvider>
        </AccountProvider>
      </SettingsProvider>
    </ThemeProvider>
  );
}

function GameTableScope() {
  return (
    <DatabaseProvider>
      <UserIdProvider>
        <Game />
      </UserIdProvider>
    </DatabaseProvider>
  );
}

function AppRoutes() {
  return (
    <Switch>
      <Route path="/game/:id">
        <GameTableScope />
      </Route>
      <Route path="/">
        <Home />
      </Route>
    </Switch>
  );
}

function App() {
  useFullscreenShortcut();

  return (
    <GlobalProviders>
      <Router>
        <AuthGate>
          <AppRoutes />
        </AuthGate>
      </Router>
    </GlobalProviders>
  );
}

export default App;
