import { Box, Heading } from "@chakra-ui/react";
import { useEffect, useState } from "react";

const IaAssistantHeader = () => {

    const fullText = "🤖 Bee IA Assistant\nAsk questions about using the app";
    const [displayedText, setDisplayedText] = useState("");
    const [isDeleting, setIsDeleting] = useState(false);
    const [index, setIndex] = useState(0);
    const [delay, setDelay] = useState(100);

    useEffect(() => {
        const handleTyping = () => {
            if (!isDeleting) {
                setDisplayedText(fullText.substring(0, index + 1));
                setIndex((prev) => prev + 1);
                setDelay(index + 1 === fullText.length ? 1500 : 100);
                if (index + 1 === fullText.length) setIsDeleting(true);
            } else {
                setDisplayedText(fullText.substring(0, index - 1));
                setIndex((prev) => prev - 1);
                setDelay(index - 1 === 0 ? 500 : 50);
                if (index - 1 === 0) setIsDeleting(false);
            }
        };
        const timer = setTimeout(handleTyping, delay);
        return () => clearTimeout(timer);
    }, [index, isDeleting]);

    return (
        <Box bg="blue.600" color="white" py={4} px={6} textAlign="center" minH={"80px"}>
            <Heading size="md" fontFamily="mono" whiteSpace="pre-line">
                {displayedText}
                <Box as="span" animation="blink 1s step-start infinite">
                    |
                </Box>
            </Heading>
        </Box>
    );
};

export default IaAssistantHeader;
