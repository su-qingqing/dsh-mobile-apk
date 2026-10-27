@echo off
REM v52 build - memory-constrained profile (2026-10-27)
REM Incident: repo default -Xmx4g + parallel=true + separate Kotlin daemon (~1.7G) x 4 retries
REM => native OOM on 31G box (hs_err pid 8628 / 16652)
REM Fix: heap 3g, workers 2, kotlin in-process (kills extra daemon JVM), parallel off
set "JAVA_HOME=C:\Users\Administrator\Desktop\3\tools\jdk\jdk-17.0.21.0.2+1"
set "ANDROID_HOME=C:/Users/Administrator/Desktop/3/tools/android-sdk"
set "ANDROID_SDK_ROOT=%ANDROID_HOME%"
set "GRADLE_USER_HOME=C:\Users\Administrator\Desktop\3\tools\gradle-home"
set "PATH=%JAVA_HOME%\bin;%PATH%"
cd /d "C:\Users\Administrator\Desktop\3\pull\shell\x\dsh-mobile-apk-v52"
echo [%time%] build start
call gradlew.bat :app:assembleDebug --console=plain --no-daemon --max-workers=2 ^
 -Dorg.gradle.parallel=false ^
 "-Dorg.gradle.jvmargs=-Xmx3g -XX:MaxMetaspaceSize=512m -Dfile.encoding=UTF-8" ^
 -Pkotlin.compiler.execution.strategy=in-process
echo BUILD_RC=%errorlevel%
echo [%time%] done
dir app\build\outputs\apk\debug\*.apk
