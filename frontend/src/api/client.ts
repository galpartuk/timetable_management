import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:8000/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add CSRF token handling
api.interceptors.request.use((config) => {
  const csrfToken = document.cookie
    .split('; ')
    .find((row) => row.startsWith('csrftoken='))
    ?.split('=')[1];
  if (csrfToken) {
    config.headers['X-CSRFToken'] = csrfToken;
  }
  return config;
});

export default api;

// Auth
export const login = (username: string, password: string) =>
  api.post('/auth/login/', { username, password });

export const logout = () => api.post('/auth/logout/');

export const getMe = () => api.get('/auth/me/');

// School
export const getSchools = () => api.get('/schools/');
export const createSchool = (data: any) => api.post('/schools/', data);

// Grades
export const getGrades = (schoolId?: number) =>
  api.get('/grades/', { params: schoolId ? { school: schoolId } : {} });

// Classes
export const getClasses = (params?: any) => api.get('/classes/', { params });
export const createClass = (data: any) => api.post('/classes/', data);
export const updateClass = (id: number, data: any) => api.put(`/classes/${id}/`, data);
export const deleteClass = (id: number) => api.delete(`/classes/${id}/`);

// Subjects
export const getSubjects = (schoolId?: number) =>
  api.get('/subjects/', { params: schoolId ? { school: schoolId } : {} });
export const createSubject = (data: any) => api.post('/subjects/', data);
export const updateSubject = (id: number, data: any) => api.put(`/subjects/${id}/`, data);
export const deleteSubject = (id: number) => api.delete(`/subjects/${id}/`);

// Teachers
export const getTeachers = (schoolId?: number) =>
  api.get('/teachers/', { params: schoolId ? { school: schoolId } : {} });
export const createTeacher = (data: any) => api.post('/teachers/', data);
export const updateTeacher = (id: number, data: any) => api.put(`/teachers/${id}/`, data);
export const deleteTeacher = (id: number) => api.delete(`/teachers/${id}/`);

// Assignments
export const getAssignments = (params?: any) => api.get('/assignments/', { params });
export const createAssignment = (data: any) => api.post('/assignments/', data);
export const updateAssignment = (id: number, data: any) => api.put(`/assignments/${id}/`, data);
export const deleteAssignment = (id: number) => api.delete(`/assignments/${id}/`);

// Constraints
export const getConstraints = (schoolId?: number) =>
  api.get('/constraints/', { params: schoolId ? { school: schoolId } : {} });
export const createConstraint = (data: any) => api.post('/constraints/', data);
export const updateConstraint = (id: number, data: any) => api.put(`/constraints/${id}/`, data);
export const deleteConstraint = (id: number) => api.delete(`/constraints/${id}/`);

// Timetables
export const getTimetables = (schoolId?: number) =>
  api.get('/timetables/', { params: schoolId ? { school: schoolId } : {} });
export const createTimetable = (data: any) => api.post('/timetables/', data);
export const getTimetable = (id: number) => api.get(`/timetables/${id}/`);
export const generateTimetable = (id: number) => api.post(`/timetables/${id}/generate/`);
export const getTimetableByClass = (timetableId: number, classId: number) =>
  api.get(`/timetables/${timetableId}/by-class/${classId}/`);
export const getTimetableByTeacher = (timetableId: number, teacherId: number) =>
  api.get(`/timetables/${timetableId}/by-teacher/${teacherId}/`);

// Import
export const uploadExcel = (file: File, schoolId: number) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('school_id', schoolId.toString());
  return api.post('/import/upload/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export const uploadDaysOff = (file: File, schoolId: number) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('school_id', schoolId.toString());
  return api.post('/import/days-off/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export const getImportLogs = (schoolId?: number) =>
  api.get('/import/logs/', { params: schoolId ? { school_id: schoolId } : {} });
