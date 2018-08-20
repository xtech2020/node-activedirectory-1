// this module will give you the possibility to make add alot of promises, but it will make sure, that only a fixed number is open.
// It was initially created to limit the number of promises making a tcp request (as windows only allows 5000 at once by default)

const getLaunchArray = (PromiseWithTcpRequest, InputValues) => {
    // This function will return a launch Array. It takes a function that returns a promise and it's input Values as an array
    // The output is an array with each entry having 3 elements
    // resolveLaunchPromise is the function that resolves tha launchPromise with the same index
    // launchPromise triggers the execution of promisewithTcpRequest
    // promiseWithTcpRequest The Input Promise with the correlating Inputvalue

    let launchArray = InputValues.map((InputValue, Index) => {
        var resolveLaunchPromise;
        var launchPromise = new Promise((resolve, reject) => {
            resolveLaunchPromise = resolve;
        });

        var promiseWithTcpRequest = new Promise((resolve, reject) => {
            launchPromise.then(() => {
                PromiseWithTcpRequest(InputValue).then((data) =>{
                    resolve(data);
                }, (err) => {
                    reject(err)
                });
            });
        });
        return {resolveLaunchPromise, launchPromise, promiseWithTcpRequest};
    });

    return launchArray;    
}

const PromisesWithMaxAtOnce = (PromiseWithTcpRequest, InputValues, MaxAtOnce) => {
    // You can input any promise that should be limited by open at the same time
    // PromiseWithTcpRequest is a function that returns a promise and takes in an input value
    // InputValue is an Array of those InputValues
    // MaxAtOnce is the number of Promises maximum pending at the same time

    let startedPromises = 0;
    let launchArray = getLaunchArray(PromiseWithTcpRequest, InputValues);
    // First start as much promises as are allowed at once (if there are less in the array than max allowed, start all of them)
    for(i=0; i<(MaxAtOnce<launchArray.length ? MaxAtOnce : launchArray.length); i++){
        launchArray[i].resolveLaunchPromise();
        startedPromises++;
    }

    // For each Promise that finishes start a new one until all are launched
    launchArray.map((Value, Index) => {
        Value.promiseWithTcpRequest.then(() => {
            if(startedPromises<launchArray.length){
                launchArray[startedPromises].resolveLaunchPromise();
                startedPromises++;
            }            
        });
    });

    return launchArray;
}

module.exports = PromisesWithMaxAtOnce;