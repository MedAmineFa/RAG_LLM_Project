import { Box, IconButton, useColorModeValue } from "@chakra-ui/react";
import { motion } from "framer-motion";
import { useState } from "react";
import { FiX } from "react-icons/fi";
import { RiRobot2Line, RiRobot2Fill } from "react-icons/ri";
import IaAssistant from "./IaAssistant";

const MotionBox = motion(Box);
const MotionIconButton = motion(IconButton);

const AiIcon = ({ isOpen }: { isOpen: boolean }) => {
  return (
    <motion.div
      initial={false}
      animate={{
        rotate: isOpen ? 0 : 360,
        scale: isOpen ? 1.1 : 1,
      }}
      transition={{
        type: "spring",
        stiffness: 500,
        damping: 20,
      }}
    >
      {isOpen ? (
        <RiRobot2Fill size="24px" />
      ) : (
        <motion.div
          animate={{
            y: [0, -5, 0],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          <RiRobot2Line size="24px" />
        </motion.div>
      )}
    </motion.div>
  );
};

const AssisantPage = () => {
  const [isOpen, setIsOpen] = useState(false);
  const buttonBg = useColorModeValue("blue.500", "blue.200");
  const buttonHoverBg = useColorModeValue("blue.600", "blue.300");
  const buttonColor = useColorModeValue("white", "gray.800");
  const shadowColor = useColorModeValue("lg", "dark-lg");

  return (
    <Box
      height="100vh"
      width="100%"
      bgGradient="linear(to-r, gray.200, blue.100)"
      display="flex"
      alignItems="center"
      justifyContent="center"
      px={4}
      position="relative"
    >
      <MotionBox
        initial={{ opacity: 0, scale: 0.8, y: 40 }}
        animate={{
          opacity: isOpen ? 1 : 0,
          scale: isOpen ? 1 : 0.8,
          y: isOpen ? 0 : 40,
          visibility: isOpen ? "visible" : "hidden",
          pointerEvents: isOpen ? "auto" : "none",
        }}
        transition={{
          type: "spring",
          damping: 25,
          stiffness: 300,
        }}
        position="absolute"
        bottom="100px"
        right="20px"
        zIndex="tooltip"
        shadow={shadowColor}
        rounded="xl"
        overflow="hidden"
        borderWidth="1px"
        borderColor={useColorModeValue("gray.200", "gray.600")}
      >
        <IaAssistant />
      </MotionBox>

      <MotionIconButton
        position="absolute"
        bottom="20px"
        right="20px"
        aria-label="AI Assistant"
        icon={isOpen ? <FiX size="24px" /> : <AiIcon isOpen={isOpen} />}
        colorScheme="blue"
        borderRadius="full"
        size="lg"
        onClick={() => setIsOpen(!isOpen)}
        bg={buttonBg}
        color={buttonColor}
        _hover={{ bg: buttonHoverBg }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
      />
    </Box>
  );
};

export default AssisantPage;
