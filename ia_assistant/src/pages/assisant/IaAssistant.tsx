import {
  Avatar,
  Box,
  Flex,
  HStack,
  VStack,
  Text,
  Button,
  Icon,
  useColorModeValue,
} from "@chakra-ui/react";
import { keyframes } from "@emotion/react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiArrowRight } from "react-icons/fi";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

import IaAssistantHeader from "../../components/Header.tsx";
import RenderBotAvatar from "../../components/RenderBotAvatar.tsx";
import InputContainer from "../../components/InputContainer.tsx";

import type { Message } from "../../pages/assisant/Message.ts";
import { getAssistantResponse } from "../../services/IAserviceApi.ts";

const typingDots = keyframes`
    0% { opacity: 0.2; transform: translateY(0); }
    20% { opacity: 1; transform: translateY(-3px); }
    100% { opacity: 0.2; transform: translateY(0); }
`;

// ── Étape 3 — Chip de navigation cliquable ───────────────────────────────
const NavigationChip = ({
  label,
  actionLabel,
  route,
  onNavigate,
}: {
  label:       string;
  actionLabel: string | null;
  route:       string;
  onNavigate:  (route: string) => void;
}) => {
  const chipBg      = useColorModeValue("blue.50",  "blue.900");
  const chipBorder  = useColorModeValue("blue.200", "blue.600");
  const chipHover   = useColorModeValue("blue.100", "blue.800");
  const labelColor  = useColorModeValue("blue.700", "blue.200");
  const actionColor = useColorModeValue("blue.500", "blue.300");

  return (
    <Button
      mt={2}
      size="sm"
      variant="outline"
      bg={chipBg}
      borderColor={chipBorder}
      borderRadius="lg"
      px={3}
      py={2}
      height="auto"
      _hover={{ bg: chipHover, transform: "translateY(-1px)", boxShadow: "sm" }}
      transition="all 0.2s ease"
      onClick={() => onNavigate(route)}
      display="flex"
      flexDirection="column"
      alignItems="flex-start"
      gap={0.5}
      whiteSpace="normal"
      textAlign="left"
    >
      {/* Ligne 1 — nom de la feature */}
      <HStack spacing={1}>
        <Text fontSize="xs" fontWeight="semibold" color={labelColor}>
          📊 {label}
        </Text>
        <Icon as={FiArrowRight} boxSize={3} color={labelColor} />
      </HStack>

      {/* Ligne 2 — nom de l'action (si présente) */}
      {actionLabel && (
        <Text fontSize="xs" color={actionColor} fontWeight="normal">
          {actionLabel}
        </Text>
      )}
    </Button>
  );
};
// ─────────────────────────────────────────────────────────────────────────────

const IaAssistant = () => {
  const userName  = "Dali";
  const navigate  = useNavigate();

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    {
      id:         1,
      from:       "bot",
      text:       "Hello! How can I help you today?",
      isTyping:   false,
      isThinking: false,
    },
  ]);

  const [inputValue, setInputValue] = useState("");
  const [botState, setBotState]     = useState<"idle" | "thinking" | "typing">("idle");

  const bgColor     = useColorModeValue("white",    "gray.800");
  const userBg      = useColorModeValue("blue.500", "blue.600");
  const botBg       = useColorModeValue("gray.100", "gray.700");
  const borderColor = useColorModeValue("gray.200", "gray.600");

  // ── Étape 3 — Navigation vers la route détectée ──────────────────────
  const handleNavigate = (route: string) => {
    navigate(route);
  };

  const handleSend = async () => {
    if (!inputValue.trim()) return;

    const userMsg: Message = {
      id:         messages.length + 1,
      from:       "user",
      text:       inputValue.trim(),
      isTyping:   false,
      isThinking: false,
    };

    const botMsgId = messages.length + 2;

    const thinkingMsg: Message = {
      id:         botMsgId,
      from:       "bot",
      text:       "",
      isTyping:   false,
      isThinking: true,
    };

    setMessages((prev) => [...prev, userMsg, thinkingMsg]);
    setInputValue("");
    setBotState("thinking");

    try {
      const requestBody = {
        question: userMsg.text,
        history:  messages.map((msg) => ({
          [msg.from]: msg.text,
        })) as Array<Record<"user" | "bot", string>>,
      };

      const response = await getAssistantResponse(requestBody);

      if (response && response.answer) {

        // ── Étape 3 — stocker navigation dans le message bot ─────────
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === botMsgId
              ? {
                  ...msg,
                  text:       "",
                  isThinking: false,
                  isTyping:   true,
                  navigation: response.navigation ?? null,  // ← stocké ici
                }
              : msg,
          ),
        );
        setBotState("typing");

        const fullText    = response.answer;
        let currentIndex  = 0;

        const interval = setInterval(
          () => {
            currentIndex++;
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === botMsgId
                  ? { ...msg, text: fullText.slice(0, currentIndex) }
                  : msg,
              ),
            );

            if (currentIndex >= fullText.length) {
              clearInterval(interval);
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === botMsgId ? { ...msg, isTyping: false } : msg,
                ),
              );
              setBotState("idle");
            }
          },
          30 + Math.random() * 20,
        );
      } else {
        throw new Error("Invalid response from assistant.");
      }
    } catch (error) {
      console.error("Failed to get assistant response:", error);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === botMsgId
            ? {
                ...msg,
                text:       "Sorry, something went wrong. Please try again.",
                isThinking: false,
                isTyping:   false,
              }
            : msg,
        ),
      );
      setBotState("idle");
    }
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <Box
      height="75vh"
      width={"35vw"}
      bg={bgColor}
      boxShadow="2xl"
      borderRadius="2xl"
      overflow="hidden"
      display="flex"
      flexDirection="column"
    >
      <IaAssistantHeader />
      <Flex
        flex="1"
        direction="column"
        px={4}
        py={2}
        overflowY="auto"
        gap={3}
        bgGradient="linear(to-b, white, gray.50)"
        _dark={{ bgGradient: "linear(to-b, gray.800, gray.900)" }}
      >
        <VStack align="stretch" spacing={3}>
          {messages.map((msg) => (
            <Flex
              key={msg.id}
              alignSelf={msg.from === "user" ? "flex-end" : "flex-start"}
              maxWidth="85%"
              align="flex-end"
              gap={3}
              flexDirection={msg.from === "user" ? "row-reverse" : "row"}
            >
              {msg.from === "bot" ? (
                <Box
                  p={1}
                  borderRadius="full"
                  bg={botState !== "idle" ? "blue.100" : "transparent"}
                  _dark={{ bg: botState !== "idle" ? "blue.900" : "transparent" }}
                  transition="background 0.3s ease"
                >
                  <RenderBotAvatar botState={botState} />
                </Box>
              ) : (
                <Avatar size="sm" name={userName} bg="blue.500" color="white" />
              )}

              <Box
                bg={msg.from === "user" ? userBg : botBg}
                color={msg.from === "user" ? "white" : "inherit"}
                px={4}
                py={2}
                borderRadius="xl"
                maxW="100%"
                fontStyle={"normal"}
                fontWeight={"normal"}
                boxShadow="sm"
                position="relative"
                transition="all 0.2s ease"
                _hover={{ transform: "translateY(-1px)", boxShadow: "md" }}
                borderWidth="1px"
                borderColor={msg.from === "user" ? "blue.400" : borderColor}
                overflow="hidden"
                _before={
                  msg.from === "bot"
                    ? {
                        content: '""',
                        position: "absolute",
                        left: "-9px",
                        bottom: "12px",
                        width: "18px",
                        height: "18px",
                        background: msg.isThinking ? "transparent" : botBg,
                        borderBottom: `1px solid ${borderColor}`,
                        borderLeft: `1px solid ${borderColor}`,
                        transform: "rotate(45deg)",
                        zIndex: 0,
                      }
                    : {
                        content: '""',
                        position: "absolute",
                        right: "-9px",
                        bottom: "12px",
                        width: "18px",
                        height: "18px",
                        background: userBg,
                        borderBottom: `1px solid ${userBg}`,
                        borderRight: `1px solid ${userBg}`,
                        transform: "rotate(-45deg)",
                        zIndex: 0,
                      }
                }
              >
                {msg.isThinking ? (
                  <HStack spacing={1}>
                    <Box as="span" animation={`${typingDots} 1.4s infinite`} style={{ animationDelay: "0s" }}>●</Box>
                    <Box as="span" animation={`${typingDots} 1.4s infinite`} style={{ animationDelay: "0.2s" }}>●</Box>
                    <Box as="span" animation={`${typingDots} 1.4s infinite`} style={{ animationDelay: "0.4s" }}>●</Box>
                  </HStack>
                ) : (
                  <Box
                    whiteSpace="normal"
                    wordBreak="break-word"
                    sx={{
                      "& > *:last-child": { mb: 0 },
                      "p:last-child":     { mb: 0 },
                      "li:last-child":    { mb: 0 },
                    }}
                  >
                    <ReactMarkdown
                      remarkPlugins={[remarkMath]}
                      rehypePlugins={[rehypeKatex]}
                      components={{
                        h1: ({ children }) => <Text fontSize="xl" fontWeight="bold" mb={4}>{children}</Text>,
                        h2: ({ children }) => <Text fontSize="lg" fontWeight="bold" mb={3}>{children}</Text>,
                        h3: ({ children }) => <Text fontSize="md" fontWeight="bold" mb={2}>{children}</Text>,
                        p:  ({ children }) => <Text mb={3} lineHeight="1.6">{children}</Text>,
                        ol: ({ children }) => <Box as="ol" pl={6} mb={3}>{children}</Box>,
                        ul: ({ children }) => <Box as="ul" pl={5} mb={3}>{children}</Box>,
                        li: ({ children }) => <Box as="li" mb={2}>{children}</Box>,
                      }}
                    >
                      {msg.text}
                    </ReactMarkdown>

                    {/* ── Étape 3 — Chip de navigation (affiché après le texte) ── */}
                    {msg.from === "bot" && !msg.isTyping && msg.navigation && (
                      <NavigationChip
                        label={msg.navigation.label}
                        actionLabel={msg.navigation.actionLabel}
                        route={msg.navigation.route}
                        onNavigate={handleNavigate}
                      />
                    )}
                  </Box>
                )}
              </Box>
            </Flex>
          ))}
        </VStack>

        <Box ref={bottomRef} />
      </Flex>

      <InputContainer
        inputValue={inputValue}
        setInputValue={setInputValue}
        handleSend={handleSend}
      />
    </Box>
  );
};

export default IaAssistant;
