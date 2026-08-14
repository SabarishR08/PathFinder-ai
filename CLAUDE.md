# PathFinder AI — Developer Guidelines

## Codebase Map
Before reading files, refer to [ARCHITECTURE.md](file:///E:/Downloads/pathfinder-ai/ARCHITECTURE.md) to understand dependencies. Avoid traversing or re-indexing files unnecessarily.

## Setup Instructions
- **Backend**: FastAPI app under ackend/. Run pip install -r requirements.txt && uvicorn main:app --reload
- **Frontend**: Vite+React app under rontend/. Run 
pm install && npm run dev

## Guidelines
- Do NOT touch the pre-computed dataset configurations in ackend/data/ unless explicitly requested.
- Preserved Graphify outputs reside in graphify-out/ locally (ignored in git).