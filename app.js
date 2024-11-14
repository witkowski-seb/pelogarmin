class PelotonGarminSync {
    constructor() {
        this.pelotonBaseUrl = 'https://api.onepeloton.com';
        this.garminBaseUrl = 'https://connect.garmin.com/modern';
        this.pelotonSession = null;
        this.garminSession = null;
        
        // Initialize UI elements
        this.initializeUI();
    }

    initializeUI() {
        // Auth buttons
        document.getElementById('pelotonAuth').addEventListener('click', () => this.authenticatePeloton());
        document.getElementById('garminAuth').addEventListener('click', () => this.authenticateGarmin());
        document.getElementById('startSync').addEventListener('click', () => this.startSync());

        // Status updates
        this.statusElement = document.getElementById('status');
        this.progressElement = document.getElementById('progress');
        this.workoutListElement = document.getElementById('workoutList');
    }

    async authenticatePeloton() {
        const email = document.getElementById('pelotonEmail').value;
        const password = document.getElementById('pelotonPassword').value;

        try {
            const response = await axios.post(`${this.pelotonBaseUrl}/auth/login`, {
                username_or_email: email,
                password: password
            });

            this.pelotonSession = response.data.session_id;
            this.showStatus('Peloton authentication successful', 'success');
            this.checkAuthStatus();
        } catch (error) {
            this.showStatus('Peloton authentication failed: ' + error.message, 'error');
        }
    }

    async authenticateGarmin() {
        const email = document.getElementById('garminEmail').value;
        const password = document.getElementById('garminPassword').value;

        try {
            // Note: In production, this should be handled through a backend
            const response = await axios.post('https://sso.garmin.com/sso/signin', {
                username: email,
                password: password
            });

            this.garminSession = response.data.session_id;
            this.showStatus('Garmin authentication successful', 'success');
            this.checkAuthStatus();
        } catch (error) {
            this.showStatus('Garmin authentication failed: ' + error.message, 'error');
        }
    }

    checkAuthStatus() {
        const syncButton = document.getElementById('startSync');
        syncButton.disabled = !(this.pelotonSession && this.garminSession);
    }

    async getRecentWorkouts(daysBack) {
        try {
            const response = await axios.get(`${this.pelotonBaseUrl}/api/me/workouts`, {
                headers: { 'Session-Id': this.pelotonSession },
                params: { limit: 100 }
            });

            const cutoffTime = new Date();
            cutoffTime.setDate(cutoffTime.getDate() - daysBack);

            return response.data.data.filter(workout => 
                new Date(workout.start_time) > cutoffTime
            );
        } catch (error) {
            throw new Error('Failed to fetch workouts: ' + error.message);
        }
    }

    async getWorkoutDetails(workoutId) {
        try {
            const response = await axios.get(
                `${this.pelotonBaseUrl}/api/workout/${workoutId}`,
                { headers: { 'Session-Id': this.pelotonSession } }
            );
            return response.data;
        } catch (error) {
            throw new Error('Failed to fetch workout details: ' + error.message);
        }
    }

    convertToGarminFormat(pelotonWorkout) {
        const workoutType = pelotonWorkout.fitness_discipline === "cycling" ? "cycling" : "general";
        
        return {
            activityType: workoutType,
            startTimeInSeconds: Math.floor(new Date(pelotonWorkout.start_time).getTime() / 1000),
            durationInSeconds: pelotonWorkout.duration,
            averageHeartRateInBeatsPerMinute: pelotonWorkout.average_heartrate || 0,
            maximumHeartRateInBeatsPerMinute: pelotonWorkout.max_heartrate || 0,
            averagePowerInWatts: pelotonWorkout.average_watts || 0,
            maximumPowerInWatts: pelotonWorkout.max_watts || 0,
            totalDistanceInMeters: (pelotonWorkout.distance || 0) * 1000,
            averageSpeedInMetersPerSecond: pelotonWorkout.average_speed || 0,
            maximumSpeedInMetersPerSecond: pelotonWorkout.max_speed || 0,
            totalCalories: pelotonWorkout.total_calories || 0,
            name: `Peloton ${workoutType.charAt(0).toUpperCase() + workoutType.slice(1)} - ${pelotonWorkout.title || 'Workout'}`
        };
    }

    async uploadToGarmin(activityData) {
        try {
            const response = await axios.post(
                `${this.garminBaseUrl}/proxy/activity-service/activity`,
                activityData,
                { headers: { 'Session-Id': this.garminSession } }
            );
            return response.data;
        } catch (error) {
            throw new Error('Failed to upload to Garmin: ' + error.message);
        }
    }

    showStatus(message, type = 'info') {
        this.statusElement.textContent = message;
        this.statusElement.className = `status ${type}`;
        this.statusElement.style.display = 'block';
    }

    addWorkoutToList(workout, status) {
        const workoutElement = document.createElement('div');
        workoutElement.className = 'workout-item';
        workoutElement.textContent = `${workout.name} - ${status}`;
        this.workoutListElement.appendChild(workoutElement);
    }

    async startSync() {
        const daysBack = parseInt(document.getElementById('daysBack').value, 10);
        this.progressElement.style.display = 'block';
        this.workoutListElement.innerHTML = '';

        try {
            const workouts = await this.getRecentWorkouts(daysBack);
            this.showStatus(`Found ${workouts.length} workouts to sync`, 'info');

            for (const workout of workouts) {
                try {
                    const details = await this.getWorkoutDetails(workout.id);
                    const garminData = this.convertToGarminFormat(details);
                    await this.uploadToGarmin(garminData);
                    this.addWorkoutToList(garminData, 'Synced successfully');
                    await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limiting
                } catch (error) {
                    this.addWorkoutToList(workout, `Failed: ${error.message}`);
                }
            }

            this.showStatus('Sync completed', 'success');
        } catch (error) {
            this.showStatus('Sync failed: ' + error.message, 'error');
        }
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    const syncTool = new PelotonGarminSync();
});
