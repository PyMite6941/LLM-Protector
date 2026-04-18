from fastapi import FastAPI

app = FastAPI()

@app.get('/')
def root():
    return {'message': 'ok'}

@app.get('/ping')
def ping():
    return {'message': 'running'}

@app.get('/test')
def deploy(url:str):
    return url