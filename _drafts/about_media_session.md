---
title: 关于我所了解的Android MediaSession
publish: false

---
## MediaSession

MediaSession 是 Android 提供的多媒体控制框架。其中包括了播放控制、声音调整，支持媒体按键，耳机线控等...

> _Allows interaction with media controllers, volume keys, media buttons, and* transport controls._

网上对于 MediaSession 相关分析的文章实在太少，所以我干脆自己写一篇，分享一下自己对于 MediaSession 的理解。

## 播放器架构设计

如果让你写一个音乐播放器，你会怎么来设计它的架构呢？

我想大家一般会设计成一下这几个部分：

* 后台的音乐服务 PlayerService


* 音乐播放控制器 PlayerController


* 播放器状态跟踪 PlayerCallback

PlayerService 负责播放器的所有逻辑，播放顺序、播放列表等。 

PlayerController 是由 PlayerService 提供给其他组件的，用于控制播放器逻辑的接口。比如响应播放按钮的点击事件：

\`\`\`kotlin

buttonPause.setOnClickListener {

    playerController.pause()

}

\`\`\`

PlayerCallback 用于监听播放器状态的改变，比如歌曲播完切换到下一首了、歌曲播放过程中出错了、网络问题导致进入缓冲状态了等。activity 中的视图需要监听播放器状态，以便实时响应这些状态的改变。

### 播放器架构细节

用上面说到的方案来设计一个拥有后台服务的播放器是十分正确的，但是它实在是太过概括了，我们需要一些更加具体的方案。