import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

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

// Auth — public
export const login = (username: string, password: string) =>
  api.post('/auth/login/', { username, password });

export const googleLogin = (credential: string) =>
  api.post('/auth/google/', { credential });

export const requestOtp = (phone: string) =>
  api.post('/auth/request-otp/', { phone });

export const verifyOtp = (userId: number, code: string) =>
  api.post('/auth/verify-otp/', { user_id: userId, code });

export const logout = () => api.post('/auth/logout/');

export const getMe = () => api.get('/auth/me/');

// Admin — super-admin only
export interface AdminUserPayload {
  full_name: string;
  email: string;
  phone?: string;
  role?: string;
  password?: string;
  is_active?: boolean;
}

export const getAdminUsers = () => api.get('/auth/admin/users/');
export const createAdminUser = (data: AdminUserPayload) =>
  api.post('/auth/admin/users/', data);
export const updateAdminUser = (id: number, data: Partial<AdminUserPayload>) =>
  api.put(`/auth/admin/users/${id}/`, data);
export const deactivateAdminUser = (id: number) =>
  api.delete(`/auth/admin/users/${id}/`);

export const getAuditLogins = (params?: {
  method?: string;
  success?: 'true' | 'false';
  user_id?: number;
}) => api.get('/auth/admin/audit/logins/', { params });

export const getAuditActivities = () =>
  api.get('/auth/admin/audit/activities/');

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

export interface TeacherQualityRow {
  id: number;
  name: string;
  first_name: string;
  last_name: string;
  lessons: number;
  windows: number;
  long_windows: number;
  max_single_gap: number;
  days_taught: number;
  days_with_windows: number;
  days_with_long_gap: number;
  longest_teaching_day: number;
  avg_daily_lessons: number;
  max_daily_lessons: number;
  first_period_count: number;
  late_period_lessons: number;
  distinct_subjects: number;
  distinct_classes: number;
  bagrut_hours: number;
  role_hours: number;
  stipend_fraction: number;
  total_contract_hours: number;
  cap: number;
  utilization_pct: number;
  has_day_off: boolean;
  day_off: number | null;
  windows_by_day: Record<string, number>;
  day_details: Record<string, {
    lessons: number;
    first: number;
    last: number;
    span: number;
    windows: number;
    max_gap: number;
    long_window_count: number;
  }>;
  subjects: string[];
}

export interface TimetableQuality {
  timetable_id: number;
  name: string;
  status: string;
  long_window_threshold: number;
  totals: {
    entries: number;
    total_teacher_windows: number;
    total_long_windows: number;
    total_class_windows: number;
    teachers_with_windows: number;
    teachers_with_long_windows: number;
    classes_with_windows: number;
    avg_teacher_windows: number;
    late_period_lessons: number;
  };
  teachers: TeacherQualityRow[];
  classes: Array<{
    id: number;
    name: string;
    grade: string;
    lessons: number;
    windows: number;
    windows_by_day: Record<string, number>;
    day_spans: Record<string, { first: number; last: number }>;
  }>;
  subject_by_period: Record<string, Record<string, number>>;
}

export const getTimetableQuality = (timetableId: number) =>
  api.get<TimetableQuality>(`/timetables/${timetableId}/quality/`);

// Import
export interface ImportPreview {
  sheets_seen: string[];
  assignment_rows_total: number;
  role_rows_total: number;
  subjects_distinct: number;
  teachers_distinct: number;
  rows_with_teacher: number;
  rows_with_hours: number;
  pool_rows: number;
  inactive_rows: number;
  class_rows_per_grade: Record<string, number>;
  top_subjects: [string, number][];
  top_teachers: [string, number][];
  warnings: string[];
  errors: string[];
  diff?: {
    new_teachers: string[];
    new_teachers_count: number;
    removed_teachers: string[];
    removed_teachers_count: number;
    new_subjects: string[];
    new_classes: string[];
    new_rows_count: number;
    stale_rows_count: number;
    hours_changes_count: number;
    hours_changes: Array<{
      sheet: string;
      row: number;
      teacher: string;
      subject: string;
      old_hours: number;
      new_hours: number;
    }>;
  };
}

export interface ImportResponse {
  message?: string;
  log_id?: number;
  dry_run?: boolean;
  preview?: ImportPreview;
  subjects_imported?: number;
  teachers_imported?: number;
  classes_imported?: number;
  assignments_imported?: number;
  roles_imported?: number;
  warnings?: string[];
  errors?: string[];
}

export const uploadExcel = (file: File, schoolId: number, opts: {
  dryRun?: boolean;
  wipeExisting?: boolean;
} = {}) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('school_id', schoolId.toString());
  if (opts.dryRun) formData.append('dry_run', 'true');
  if (opts.wipeExisting) formData.append('wipe_existing', 'true');
  return api.post<ImportResponse>('/import/upload/', formData, {
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

export interface GapAnalysis {
  school_id: number;
  classes_missing_homeroom_count: number;
  classes_missing_homeroom: Array<{ id: number; grade__name: string; number: number }>;
  assignments_without_teacher_count: number;
  assignments_without_teacher: Array<{
    id: number;
    subject__name_he: string;
    school_class__grade__name: string;
    school_class__number: number;
    weekly_hours: string | number;
    track_label: string;
  }>;
  assignments_without_hours_count: number;
  assignments_without_hours: Array<any>;
  teacher_loads: Array<{
    id: number;
    name: string;
    assigned_hours: number;
    role_hours: number;
    must_teach: number;
    cap: number;
    over_cap: boolean;
    under_must_teach: boolean;
  }>;
}

export const getGapAnalysis = (schoolId: number) =>
  api.get<GapAnalysis>('/import/gap-analysis/', { params: { school_id: schoolId } });

// Export
export interface ExportOptions {
  sheets: string[];
  super_admin_only: string[];
  is_super_admin: boolean;
}

export const getExportOptions = () => api.get<ExportOptions>('/export/options/');

export const exportExcel = (spec: {
  sheets: string[];
  timetable_id?: number;
  school_id?: number;
}) =>
  api.post('/export/excel/', spec, { responseType: 'blob' });

// Manage / delete
export const deleteTimetable = (id: number) =>
  api.delete(`/manage/timetable/${id}/`);

export const clearTimetableEntries = (id: number) =>
  api.post(`/manage/timetable/${id}/clear/`);

export const bulkDelete = (operation: string, schoolId?: number) =>
  api.post('/manage/bulk-delete/', { operation, school_id: schoolId });
