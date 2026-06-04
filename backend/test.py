from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report
texts=[]
labels=[]
vec = TfidfVectorizer(ngram_range=(1, 2), max_features=5000)
X = vec.fit_transform(texts)
model = LogisticRegression(max_iter=1000).fit(X, labels)
print(classification_report(labels, model.predict(X)))