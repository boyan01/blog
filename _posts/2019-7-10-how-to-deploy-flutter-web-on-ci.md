---
title: "在ci上发布flutter_web项目到git page的正确姿势"
published: true
---

废话不多说,我们大家都知道下面这一行命令可以构建 flutter_web 工程项目.

``` 
$ webdev build
```

但是这个构建的产物却又很大的问题,会生成很多乱七八糟的东西,而且这些东西也不是运行所必要的.

如果不想麻烦的话,可以自己手动慢慢删~~


## peanut.dart

由于 webdev build 有缺点, 于是诞生一个神器来帮助构建并发布产物到 gh-pages 分支,方便你将项目发布到 github page.

> 先贴一下项目地址: https://github.com/kevmoo/peanut.dart

但是这个神器在 ci 上却不是那么好使.

由于 ci 构建的时候, 只会 clone 指定的 branch. 而 peanut 运行又需要完整的 git 环境. 于是导致频频报错.

## 改造 peanut.dart

> 项目地址: https://github.com/boyan01/peanut.dart

基于以上情况,我对 peanut 进行简化,删除了构建成功后自动将产物提交到gh-pages分支这一功能.

这样就能愉快的在ci上将构建的产物 deploy 到 gh-pages 啦...

## 推荐阅读

如何发布产物到 git page : https://docs.travis-ci.com/user/deployment/pages/