import { useState, FormEvent } from "react";
import { Box, Flex, Text, Input, Label, Button } from "theme-ui";

import LoadingOverlay from "./LoadingOverlay";
import ErrorBanner from "./banner/ErrorBanner";
import ConnectionStatusDot from "./ConnectionStatusDot";

import { useAccount } from "../contexts/AccountContext";
import { accountsAvailable } from "../helpers/account";

/**
 * Sits above the router (App.tsx): no valid session → registration/login
 * form; valid session → renders children straight through. The guiding
 * principle: first use = sign-up ("primeiro uso = cadastro").
 *
 * When this build has no broker configured at all (accountsAvailable ===
 * false, e.g. a plain browser preview with no VITE_BROKER_URL/PORT) the
 * gate is a no-op — there is nowhere to register an account against, and
 * blocking the whole app behind a login form it can never satisfy would be
 * worse than skipping it.
 */
function AuthGate({ children }: { children: React.ReactNode }) {
  const { session, isLoaded, login, register } = useAccount();
  const [isRegistering, setIsRegistering] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<Error>();

  if (!accountsAvailable) {
    return <>{children}</>;
  }

  if (!isLoaded) {
    return <LoadingOverlay bg="background" />;
  }

  if (session) {
    return <>{children}</>;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(undefined);
    try {
      if (isRegistering) {
        await register(username, password, displayName);
      } else {
        await login(username, password);
      }
    } catch (e) {
      if (e instanceof Error) {
        setError(e);
      }
    }
    setIsSubmitting(false);
  }

  return (
    <Flex
      sx={{
        flexDirection: "column",
        justifyContent: "center",
        minHeight: "100%",
        alignItems: "center",
        position: "relative",
      }}
    >
      <Box m={3} sx={{ position: "absolute", top: 0, left: 0 }}>
        <ConnectionStatusDot />
      </Box>
      <Flex
        sx={{
          flexDirection: "column",
          justifyContent: "center",
          maxWidth: "300px",
          flexGrow: 1,
        }}
        mb={2}
      >
        <Text variant="wordmark" as="h1" sx={{ textAlign: "center" }}>
          Artisan
        </Text>
        <Box as="form" onSubmit={handleSubmit} mt={4}>
          <Label htmlFor="auth-username" mb={1}>
            Usuário
          </Label>
          <Input
            id="auth-username"
            name="username"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            mb={2}
            required
          />
          {isRegistering && (
            <>
              <Label htmlFor="auth-display-name" mb={1}>
                Nome do Jogador
              </Label>
              <Input
                id="auth-display-name"
                name="displayName"
                autoComplete="nickname"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                mb={2}
                required
              />
            </>
          )}
          <Label htmlFor="auth-password" mb={1}>
            Senha
          </Label>
          <Input
            id="auth-password"
            name="password"
            type="password"
            autoComplete={isRegistering ? "new-password" : "current-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            mb={2}
            required
          />
          <Button variant="cta" sx={{ width: "100%" }} mb={2} disabled={isSubmitting}>
            {isRegistering ? "Criar Conta" : "Entrar"}
          </Button>
          <Text
            as="p"
            variant="caption"
            sx={{ cursor: "pointer", textAlign: "center" }}
            onClick={() => {
              setIsRegistering(!isRegistering);
              setError(undefined);
            }}
          >
            {isRegistering
              ? "Já tem uma conta? Entrar"
              : "Não tem conta? Criar uma"}
          </Text>
        </Box>
      </Flex>
      {isSubmitting && <LoadingOverlay bg="overlay" />}
      <ErrorBanner error={error} onRequestClose={() => setError(undefined)} />
    </Flex>
  );
}

export default AuthGate;
