---
title: "Android Flutter 混合开发"
publish: true
---
> 最近在公司的一个项目里引入Flutter，并用Flutter开发了一个播放记录页面。在开发的过程中间遇到了不少问题，于是在此总结一下，权当个记录吧。

先简单介绍一下项目背景：Android TV端APP。

## 1 Flutter接入

### 1.1 创建Flutter module

```shell
flutter create -t module xxapp_module
```

执行成功之后，会创建一个 **xxapp_module**的文件夹。

module中文件有这些：

```shell
-rw-r--r--  1 ff  staff   161B  6 25 11:14 README.md
drwxr-xr-x  3 ff  staff    96B  6 25 11:14 lib
-rw-r--r--  1 ff  staff   3.2K  6 25 11:14 pubspec.lock
-rw-r--r--  1 ff  staff   3.4K  6 25 11:14 pubspec.yaml
drwxr-xr-x  3 ff  staff    96B  6 25 11:14 test
-rw-r--r--  1 ff  staff   896B  6 25 11:14 xxapp_module.iml
-rw-r--r--  1 ff  staff   1.4K  6 25 11:14 xxapp_module_android.iml
```

与纯Flutter项目结构比起来似乎没什么差异。

仔细一看还是有区别的

1. `pubspec.yaml`文件多了关于 module 相关的配置，可酌情修改。

```yaml
  # This section identifies your Flutter project as a module meant for
  # embedding in a native host app.  These identifiers should _not_ ordinarily
  # be changed after generation - they are used to ensure that the tooling can
  # maintain consistency when adding or modifying assets and plugins.
  # They also do not have any bearing on your native host application's
  # identifiers, which may be completely independent or the same as these.
  module:
    androidX: false
    androidPackage: com.example.xxapp_module
    iosBundleIdentifier: com.example.xxappModule
```

2. 隐藏文件

```shel
drwxr-xr-x  12 ff  staff   384B  6 25 11:14 .android
-rw-r--r--   1 ff  staff   339B  6 25 11:14 .gitignore
drwxr-xr-x   5 ff  staff   160B  6 25 11:14 .idea
drwxr-xr-x   7 ff  staff   224B  6 25 11:14 .ios
-rw-r--r--   1 ff  staff   305B  6 25 11:14 .metadata
-rw-r--r--   1 ff  staff   1.9K  6 25 11:14 .packages
```

其中 `.android` 和 `.ios  `是可以由 ` flutter packages get` 命令生成的，所以不必添加到版本控制中。

---

### 1.2 原项目引入Flutter Module

1. 配置 setting 文件

我们可以仿照 `.android/setting.gradle` 中的配置，在原来的项目中加入

```gradle
setBinding(new Binding([gradle: this]))
evaluate(new File(settingsDir, 'xx_module/.android/include_flutter.groovy'))
```

**这么做的目的是配置 gradle ，将 flutter 以及 flutter plugins 加入到工程里，参与整个构建流程** 

完成之后，使用 `./gradlew projects` 命令，可以看到项目中多了一个名为 `:flutter` 的projects。

```shell
Root project 'My Application'
+--- Project ':app'
\--- Project ':flutter'
```

2. 将 flutter 添加 dependency 中

完成第一步，还需要将 flutter project 作为依赖添加进来，这样才能将 flutter 的产物打包到 apk 中。

```groovy
implementation project(':flutter') //flutter
```

### 1.3 创建 FlutterActivity

新建 `XXXActivity` 并继承自 `FlutterActivity` 就好了，需要在onCreate中注册Plugin。

```java
    GeneratedPluginRegistrant.registerWith(this);
```

这样运行起来，就可以看到熟悉的 Flutter Example界面了。

如果出现错误 ensureInitializationComplete must be called after startInitialization. 那么需要调用`FlutterMain.startInitialization`方法初始化 Flutter 配置。

纯Flutter应用是在Application中初始化的，详见(io.flutter.app.FlutterApplication)。当然也可以在Activity中初始化，需结合自身情况来判断。

## 2 遇到的问题

### 2.1 启用Flutter Debug模式

>  如果你项目的 build tools 版本大于 2.3.3，或者没有使用 atlas，那么就不用看这段了。直接点RunApp按钮就行了

**公司项目使用了atlas, 而 atlas 存在 buildType 传递失效的问题(build tools 2.3.3也有此问题)。体现在执行apk打debug包时，集成的library却是release版本**

为了方便开发，需要启用flutter debug模式支持热加载。找了不少资料，顺手学了gradle的语法，实现了一个策略：

1. 在 gradle.properties 中添加
```properties
enable_flutter_debug=false
```
2. 在rootProject的 build.gradle文件中加上
```groovy
if (enable_flutter_debug.toBoolean()) {

    Set<Project> flutterProjects = []

    def flutterProjectRoot
    subprojects.each { Project project ->
        if ("flutter" == project.name) {
            flutterProjectRoot = project.projectDir.parentFile.parent
            flutterProjects.add(project)
        }
    }

    if (flutterProjectRoot != null) {
        def plugins = new Properties()
        def pluginsFile = new File(flutterProjectRoot, '.flutter-plugins')
        if (pluginsFile.exists()) {
            pluginsFile.withReader('UTF-8') { reader -> plugins.load(reader) }
        }

        plugins.each { name, path ->
            def project = findProject(":$name")
            if (project != null) {
                flutterProjects.add(project)
            }
        }
    }

    //将flutter相关项目buildType修改为Debug
    //由于Atalas的问题,导致BuildType无法传递,从而使得Flutter项目打出的包总是Release版本
    //所以在此进行修改,强制将其变为debug版本
    flutterProjects.each { project ->
        project.afterEvaluate {
            it.android.defaultPublishConfig = "debug"
        }
    }

    //assembleDebug时,flutterBuildX86Jar这个Task需要在最前面执行
    //保证flutter plugin 编译时能够正确获取到flutterX86.jar文件
    gradle.taskGraph.whenReady { taskGraph ->
        def task = taskGraph.getAllTasks().find { Task task -> task.path == ':flutter:flutterBuildX86Jar' }
        if (task == null) return
        task.getActions().each { Action action ->
            action.execute(task)
        }
    }
}
```

### 2.2 Flutter Focus

Flutter Focus 在两个月之前是一个非常棘手的难点，但随着桌面版计划的推进，Focus问题官方也已经着手提供相关解决方案了。

更多相关可以查看  [focus_manager.dart](https://github.com/flutter/flutter/blob/master/packages/flutter/lib/src/widgets/focus_manager.dart) 

我这里也有一个样例可供参考： https://github.com/boyan01/flutter_focus_loss

### 2.3 Flutter GridView item获取Focus自动居中

使用 ScrollPosition#ensureVisible 方法即可。

```dart
return Focus(
    autofocus: true,
    onFocusChange: (hasFocus) {
      final scrollPosition = Scrollable.of(context).position;
      if (hasFocus) {
        
        //当前item获取到Focus时，自动滚动到屏幕中间。
        scrollPosition.ensureVisible(context.findRenderObject(),
            alignment: 0.5, duration: const Duration(milliseconds: 300));
 
        //重置自定义 MyRenderSliverGrid 的 focusdIndex
        //改变 griad 绘制 children的顺序，详见2.4
        FocusRenderSliverGrid sliverGrid =
            context.ancestorRenderObjectOfType(
                const TypeMatcher<FocusRenderSliverGrid>());
        sliverGrid.focusedIndex = index;
      }
    },
    child: childWidget);
```

### 2.4  Flutter GridView item 放大后会被遮挡

可通过重写 RenderSliverGrid 的 paint方法 ，改变其绘制 children 的顺序解决。

源码可以参考 https://gist.github.com/boyan01/29f648340193e6b556f86ef05369627b

当然，需要在child获取到focus时，手动改变一下index

```dart
FocusRenderSliverGrid sliverGrid =
    context.ancestorRenderObjectOfType(
        const TypeMatcher<FocusRenderSliverGrid>());
sliverGrid.focusedIndex = index;
```

