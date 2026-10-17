import { useState, useRef, useEffect } from "react";
import { Box, Flex, IconButton, Text, Button } from "theme-ui";

import PersonIcon from "../icons/PersonIcon";
import LogoutIcon from "../icons/LogoutIcon";

import { useAccount } from "../contexts/AccountContext";

/**
 * Person icon in the top right of the home screen →
 * dropdown with the Player name and "Sair" (Log Out, which returns to the
 * login screen via AccountContext dropping the session).
 */
function AccountMenu() {
  const { session, logout } = useAccount();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    function handlePointerDown(event: PointerEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isOpen]);

  if (!session) {
    return null;
  }

  return (
    <Box ref={containerRef} sx={{ position: "relative" }}>
      <IconButton
        aria-label="Account"
        title={session.displayName}
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <PersonIcon />
      </IconButton>
      {isOpen && (
        <Flex
          bg="surface"
          p={2}
          sx={{
            position: "absolute",
            top: "100%",
            right: 0,
            flexDirection: "column",
            alignItems: "stretch",
            borderRadius: "12px",
            border: "1px solid",
            borderColor: "rgba(255, 255, 255, 0.06)",
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.45)",
            zIndex: 10,
            minWidth: "180px",
            gap: "2px",
          }}
        >
          <Text as="p" px={2} pt={1} pb={2} variant="body2">
            {session.displayName}
          </Text>
          <Button
            variant="menuItem"
            onClick={() => {
              setIsOpen(false);
              logout();
            }}
          >
            <LogoutIcon />
            Sair
          </Button>
        </Flex>
      )}
    </Box>
  );
}

export default AccountMenu;
