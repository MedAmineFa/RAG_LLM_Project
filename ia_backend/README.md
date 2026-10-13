# RAG_LLM_Project

## Description

This project is an AI-powered document analysis application that enables users to upload PDF files (e.g., `finance.pdf`) and JSON data for automated processing and intelligent information retrieval.

Built with **Retrieval-Augmented Generation (RAG)** and **Large Language Models (LLMs)**, the application leverages LangChain to retrieve relevant information from documents and generate context-aware responses. LangGraph is used to orchestrate AI workflows, while FastAPI handles backend logic and API requests. A Node.js-based frontend provides an interactive interface for submitting documents and viewing AI-generated results.

The project demonstrates how modern AI technologies can transform unstructured documents into accessible, actionable information through natural-language interaction.

## Key Features

- **PDF Document Processing:** Import and process PDF files to extract relevant textual information.
- **JSON Data Integration:** Support JSON input for structured data processing and analysis.
- **RAG-Based Information Retrieval:** Retrieve relevant document content to provide contextually grounded responses.
- **LLM-Powered Analysis:** Generate intelligent answers and summaries based on the available context.
- **AI Workflow Orchestration:** Use LangGraph to organize and coordinate AI processing steps.
- **REST API Backend:** Build and manage application endpoints with FastAPI.
- **Interactive Frontend:** Display AI-generated responses and analysis results through a Node.js-based interface.
- **Modular Architecture:** Separate frontend, backend, and AI processing components for easier maintenance and future development.

## Technologies Used

| Technology | Purpose |
|---|---|
| Python | Core AI and backend development |
| FastAPI | REST API and backend services |
| Node.js | Frontend environment and application interface |
| LangChain | LLM integration and RAG pipelines |
| LangGraph | AI workflow orchestration |
| RAG | Context-aware document retrieval and generation |
| LLMs | Natural-language understanding and response generation |
| PDF & JSON | Document ingestion and structured data input |

## How It Works

1. **Upload:** The user provides a PDF document and/or JSON data.
2. **Process:** The backend extracts and prepares the available information.
3. **Retrieve:** The RAG pipeline retrieves relevant document content when needed.
4. **Analyze:** The LLM generates responses using the retrieved context and available data.
5. **Orchestrate:** LangGraph coordinates the AI workflow.
6. **Display:** FastAPI returns the results to the frontend for interactive visualization.

## Project Goals

- Explore practical applications of Generative AI and LLM-based systems.
- Implement document question-answering using RAG.
- Build modular AI workflows with LangChain and LangGraph.
- Integrate AI capabilities into a full-stack application.
- Provide a foundation for extending the system to financial document analysis and other business use cases.

## Author

**Med Amine Fassatoui**

GitHub: [@MedAmineFa](https://github.com/MedAmineFa)


