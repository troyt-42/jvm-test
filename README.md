# jvm-test

This repo is prepared to check out the performance improvemnt of using inline caching (IC).

Install v8 first and then run:
```
d8 --harmony quasi-lua-runtime.js points.js
```
and 
```
d8 --harmony quasi-lua-runtime-IC.js points-IC.js
```
