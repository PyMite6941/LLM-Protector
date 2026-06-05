echo "Do you want to install Llama 3 Latest?? (Y/n)"
read -r response
if [[ $response = "Y" || $response = "y" ]]; then
  ollama pull llama3:latest
fi
python -m venv backend/.venv
source backend/.venv/bin/activate
pip install -r backend/requirements.txt
cd frontend
npm install
echo "Setup complete! Run the frontend and backend to start."