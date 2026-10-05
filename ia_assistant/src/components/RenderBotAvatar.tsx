import { Box } from "@chakra-ui/react";
import { RiRobot2Line, RiRobot2Fill } from "react-icons/ri";
import { BsStars } from "react-icons/bs";
import { keyframes } from "@emotion/react";


const thinkingAnimation = keyframes`
  0% { transform: translateY(0); }
  25% { transform: translateY(-3px); }
  50% { transform: translateY(0); }
  75% { transform: translateY(3px); }
  100% { transform: translateY(0); }
`;

const typingDots = keyframes`
  0%, 80%, 100% { transform: scale(0); }
  40% { transform: scale(1); }
`;


interface Props {
    botState:"idle" | "thinking" | "typing"
}

const RenderBotAvatar = ({ botState }:Props) => {
    const renderBotAvatar = () => {
        switch (botState) {
            case "thinking":
                return (
                    <Box position="relative">
                        <RiRobot2Line size="24px" />
                        <Box
                            position="absolute"
                            top="-5px"
                            right="-5px"
                            animation={`${thinkingAnimation} 1.5s infinite`}
                        >
                            <BsStars size="12px" color="#3182ce" />
                        </Box>
                    </Box>
                );
            case "typing":
                return (
                    <Box position="relative">
                        <RiRobot2Fill size="24px" color="#3182ce" />
                        <Box
                            position="absolute"
                            bottom="-5px"
                            right="-5px"
                            display="flex"
                            gap="2px"
                        >
                            {[1, 2, 3].map((dot) => (
                                <Box
                                    key={dot}
                                    as="span"
                                    display="inline-block"
                                    w="4px"
                                    h="4px"
                                    borderRadius="full"
                                    bg="blue.500"
                                    animation={`${typingDots} 1.4s infinite`}
                                    style={{ animationDelay: `${dot * 0.2}s` }}
                                />
                            ))}
                        </Box>
                    </Box>
                );
            default:
                return <RiRobot2Line size="24px" />;
        }
    };

    return renderBotAvatar();
};

export default RenderBotAvatar;
