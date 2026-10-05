import { Outlet, NavLink } from "react-router-dom";
import {
  Box,
  Flex,
  HStack,
  Text,
  Icon,
} from "@chakra-ui/react";
import { TbHexagon, TbSparkles, TbChartBar } from "react-icons/tb";

const NAV_LINKS = [
  { to: "/",     label: "IA",   icon: TbSparkles, end: true  },
  { to: "/kpis", label: "KPIs", icon: TbChartBar, end: false },
];

const RootLayout = () => {
  return (
    <Box minH="100vh" bg="gray.50">

      <Flex
        as="nav"
        position="fixed"
        top={0} left={0} right={0}
        h="60px"
        px={8}
        align="center"
        justify="space-between"
        bg="white"
        borderBottom="1px solid"
        borderColor="gray.200"
        zIndex="sticky"
        boxShadow="sm"
      >
        {/* Brand */}
        <HStack gap={2}>
          <Icon as={TbHexagon} boxSize={5} color="blue.500" />
          <Text
            fontWeight="700"
            fontSize="md"
            letterSpacing="wide"
            color="gray.800"
          >
            Bee
          </Text>
        </HStack>

        {/* Nav Links */}
        <HStack gap={1}>
          {NAV_LINKS.map(({ to, label, icon, end }) => (
            <NavLink key={to} to={to} end={end}>
              {({ isActive }) => (
                <HStack
                  gap={2}
                  px={4}
                  py={2}
                  rounded="md"
                  fontSize="sm"
                  fontWeight="500"
                  transition="all 0.15s"
                  color={isActive ? "blue.600" : "gray.500"}
                  bg={isActive ? "blue.50" : "transparent"}
                  _hover={{
                    color: "gray.800",
                    bg: "gray.100",
                  }}
                >
                  <Icon as={icon} boxSize={4} />
                  <Text>{label}</Text>
                </HStack>
              )}
            </NavLink>
          ))}
        </HStack>
      </Flex>

   
      <Box pt="60px">
        <Outlet />
      </Box>
    </Box>
  );
};

export default RootLayout;